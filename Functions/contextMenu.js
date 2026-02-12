/**
 * Context Menu Interaction Handler
 *
 * This module handles all Discord context menu interactions, modal submissions,
 * button clicks, and select menu interactions for the bot. It includes handlers
 * for message management (delete/move), haiku searches, and reminder management.
 *
 * @module Functions/contextMenu
 */

var babadata = require('../babotdata.json'); //baba configuration file

const Discord = require('discord.js');
const { ModalBuilder, ActionRowBuilder, TextInputBuilder } = require('discord.js');

const { movetoChannel } = require('./HelperFunctions/adminHelpers.js');
const { babaHaikuEmbed, babaHaikuLinks } = require('./commandFunctions.js');
const { handleButtonsEmbed, getTimeFromString, FindDate } = require('./HelperFunctions/basicHelpers.js');
const { getReminder, editReminder, removeReminder, handleButtonsEmbedReminders, getUserReminder, getUserReminderAndIDFromID, getUserIDFromID } = require('./HelperFunctions/remindersByBaba.js');
const { sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise } = require('./HelperFunctions/dbHelpers.js');
const { getD1 } = require('../Tools/overrides.js');

global.ReminderList = {};

// ============================================================================
// CONTEXT MENU HANDLERS
// ============================================================================

/**
 * Handles context menu interactions (right-click actions on messages)
 *
 * This function processes two main context menu commands:
 *
 * 1. "Delete" - Searches for the target message across all channels and threads,
 *    then moves it to the log channel (babadata.logchan) using the movetoChannel
 *    helper function. The original message is deleted after being logged.
 *
 * 2. "Move To" - Shows a modal dialog allowing the user to specify a destination
 *    channel ID where the message should be moved. The modal is pre-filled with
 *    the target message ID for convenience.
 *
 * Message Search Process:
 * - Iterates through all guild channels
 * - Searches both regular text channels (type 0) and their threads
 * - Uses message.fetch() with try-catch to handle missing messages gracefully
 * - Stops searching once the message is found (fnd flag)
 *
 * Permission Requirements:
 * - No explicit permission check in this function
 * - movetoChannel helper may have admin checks (babadata.adminId)
 *
 * @param {Discord.MessageContextMenuCommandInteraction} interaction - The context menu interaction from Discord
 * @param {Discord.Client} bot - The Discord bot client instance
 * @returns {Promise<void>}
 */
async function contextInfo(interaction, bot)
{
    var commandName = interaction.commandName;

    if (commandName === "Delete")
    {
		await interaction.deferReply({ ephemeral: true });
        var fnd = false; // Flag to stop searching once message is found
        var msgID = interaction.targetId;

        var chanMap = interaction.guild.channels.fetch().then(channels => {
            channels.each(chan => {
                // Only search text channels (type 0) and stop if message already found
                if (!fnd && chan.type == 0)
                {
                    // Search all threads in this channel
                    chan.threads.fetch().then(thread =>
                        thread.threads.each(thr =>
                        {
                            thr.messages.fetch(msgID).then(message =>
                            {
                                fnd = true; // Mark as found to stop other searches
                                // Move message to log channel and delete original
                                movetoChannel(message, thr, babadata.logchan);
                                interaction.editReply({ content: "Message Moved", ephemeral: true });
                            }).catch(function (err) {}); // Silently fail if message not in this thread
                        })
                    ).catch(function (err) {});

                    chan.messages.fetch(msgID).then(message => 
                    {
                        fnd = true;
                        movetoChannel(message, chan, babadata.logchan);
                        interaction.editReply({ content: "Message Moved", ephemeral: true });
                    }).catch(function (err) {}); //try to get the message, if it exists call setVote, otherwise catch the error
                }
            });
        });
        await interaction.editReply({ content: "Searching for Message", ephemeral: true });
    }
    else if (commandName === "Move To")
    {
        var fnd = false;
        var msgID = interaction.targetId;
        var channelId = interaction.channelId;

        const modal = new ModalBuilder()
            .setCustomId('movetoModal')
            .setTitle('Move Message');

        const messageIDShow = new TextInputBuilder()
			.setCustomId('msgID')
			.setLabel("The ID of the Message to Move - Autofilled")
			.setStyle(1)
            .setRequired(true)
            .setPlaceholder(msgID)
            .setValue(msgID);
        
        const channelIDInput = new TextInputBuilder()
            .setCustomId('chanIDInput')
            .setLabel("The ID of the Channel to Move to")
            .setStyle(1)
            .setRequired(true)
            .setPlaceholder("Channel ID");

		// An action row only holds one text input,
		// so you need one action row per text input.
		const firstActionRow = new ActionRowBuilder().addComponents(messageIDShow);
		const thtrdActionRow = new ActionRowBuilder().addComponents(channelIDInput);
		// Add inputs to the modal
		modal.addComponents(firstActionRow, thtrdActionRow);

        interaction.showModal(modal);
    }
}

// ============================================================================
// MODAL SUBMISSION HANDLERS
// ============================================================================

/**
 * Handles modal form submissions from users
 *
 * This function processes submissions from various modal dialogs:
 *
 * 1. "movetoModal" - Processes the Move To context menu modal submission
 *    - Extracts message ID and destination channel ID from form inputs
 *    - Searches all channels/threads for the target message
 *    - Calls movetoChannel to relocate the message to specified destination
 *    - Provides feedback: "Searching for Message" → "Message Moved"
 *
 * 2. "haiku-*" modals - Processes haiku/purity score search parameters
 *    - Extracts search criteria: start date, end date, keyword, person
 *    - Retrieves global interaction state (people list, channel list, purity mode)
 *    - Sanitizes all user inputs with SQL escape function
 *    - Generates haiku embed with pagination (5 items per page)
 *    - Creates interactive buttons for navigation if multiple pages exist
 *    - Supports three modes: purity score, single haiku, multi-haiku list
 *
 * 3. "editReminder-*" modal - Updates an existing reminder
 *    - Extracts reminder ID, page number, and user ID from custom ID
 *    - Validates reminder exists and retrieves current data
 *    - Processes new message, date, and time inputs
 *    - Validates date/time format and ensures future dates only
 *    - Falls back to original values if inputs are invalid
 *    - Updates the reminder in database via editReminder()
 *    - Refreshes the reminder list display if it's currently shown
 *    - Provides detailed feedback about what was changed
 *
 * 4. "deleteReminder-*" modal - Confirms and deletes a reminder
 *    - Validates reminder exists before deletion
 *    - Removes reminder from database via removeReminder()
 *    - Refreshes the reminder list display for the user
 *    - Cleans up global state and message references
 *
 * Global State Management:
 * - global.interactions[id]: Stores search parameters and UI state
 * - global.ReminderList[id]: Tracks active reminder messages for live updates
 * - global.ReminderMessageExists[id]: Flags for message deletion tracking
 *
 * Error Handling:
 * - Gracefully handles missing messages with .catch()
 * - Validates reminder existence before operations
 * - Provides user-friendly error messages for invalid inputs
 *
 * Database Operations:
 * - All user inputs are SQL-escaped before queries
 * - Uses helper functions for reminder CRUD operations
 *
 * @param {Discord.ModalSubmitInteraction} interaction - The modal submission interaction
 * @param {Discord.Client} bot - The Discord bot client instance
 * @returns {Promise<void>}
 */
async function modalInfo(interaction, bot)
{
    var cid = interaction.customId;
    if (cid === "movetoModal")
    {
        await interaction.deferReply({ ephemeral: true });
        var msgID = interaction.fields.getTextInputValue("msgID");
        var chansend = interaction.fields.getTextInputValue("chanIDInput");

        var fnd = false;

        var chanMap = interaction.guild.channels.fetch().then(channels => {
            channels.each(chan => { //iterate through all the channels
                if (!fnd && chan.type == 0) //make sure the channel is a text channel
                {
                    chan.threads.fetch().then(thread => 
                        thread.threads.each(thr =>
                        {
                            thr.messages.fetch(msgID).then(message => 
                            {
                                fnd = true;
                                movetoChannel(message, thr, chansend)
                                interaction.editReply({ content: "Message Moved", ephemeral: true });
                            }).catch(function (err) {});
                        })
                    ).catch(function (err) {});

                    chan.messages.fetch(msgID).then(message => 
                    {
                        fnd = true;
                        movetoChannel(message, chan, chansend)
                        interaction.editReply({ content: "Message Moved", ephemeral: true });
                    }).catch(function (err) {}); //try to get the message, if it exists call setVote, otherwise catch the error
                }
            });
        });
        await interaction.editReply({ content: "Searching for Message", ephemeral: true });
    }
    else if (cid.startsWith("haiku-"))
    {
        await interaction.deferReply();
        var id = cid.split("-")[2];

        var globalData = global.interactions[id];

        var globalPeople = globalData["personList"];
        var globalChans = globalData["channelList"];

        var globalPurityMode = globalData["puritymode"];

        var purity = globalData["purity"];
        var list = globalPurityMode;

        var all = globalData["all"];

        var sdate = interaction.fields.getTextInputValue("startDateInput");
        var edate = interaction.fields.getTextInputValue("endDateInput");
        var keyword = interaction.fields.getTextInputValue("keywordInput");
        var person = interaction.fields.getTextInputValue("personInput");

        global.interactions[id]["sdate"] = sdate;
        global.interactions[id]["edate"] = edate;
        global.interactions[id]["keyword"] = keyword;
        global.interactions[id]["person"] = person;

        person = person + "---" + (globalPeople != null ? globalPeople.join(",") : "");
        chans = (globalChans != null ? globalChans.join(",") : "");

        if (person != null)
            person = sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise(person);
        
        if (keyword != null)
            keyword = sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise(keyword);

        if (chans == "") chans = null;
        if (person == "") person = null;
        if (person == "---") person = null;
        if (keyword == "") keyword = null;
        if (sdate == "") sdate = null;
        if (edate == "") edate = null;

        var buy = 4;
        var msgstr = [sdate, edate, chans, person, keyword, (all ? "all" : (purity ? "purity" : null)), (purity ? list : null)];

        var message = await interaction.fetchReply();
        var info = {"ipp": 5, "page": 0}


        var cont = babaHaikuEmbed(purity, buy, msgstr, info);
        var deadData = purity || cont[0].components == null ?  null : babaHaikuLinks(cont);

        interaction.editReply(cont[info.page]);
        if (cont[info.page].components != null && cont.length > 1)
        {
            handleButtonsEmbed(interaction.channel, message, interaction.user.id, cont, deadData);
        }
    }
    else if (cid.startsWith("editReminder-"))
    {
        var remID = cid.split("-")[1];
        var page = cid.split("-")[2];
        var userID = cid.split("-")[3];
        var reminder = getReminder(remID);

        var authorID = interaction.user.id;

        if (reminder == null)
            await interaction.reply({content: "Reminder not found, it may have been deleted/completed already", ephemeral: true});
        else
        {
            var message = interaction.fields.getTextInputValue("messageInput");
            var date = interaction.fields.getTextInputValue("dateInput");
            var time = interaction.fields.getTextInputValue("timeInput");
    
            var theTime = getTimeFromString(time);
            var theDate = FindDate(date);

            var extral = "";

            if (message == null || message == "")
            {
                message = reminder.Message;
                extral += ": Invalid Message, keeping original message";
            }

            if (theDate == null || theTime == null)
                extral += ": Invalid Date/Time, keeping original date time";
            else
            {
                theDate = new Date(theDate.year, theDate.month - 1, theDate.day);
                theDate = new Date(theDate.getFullYear(), theDate.getMonth(), theDate.getDate(), theTime.getHours(), theTime.getMinutes(), theTime.getSeconds());
            }

            if (theDate != null && theDate < getD1(true))
            {
                extral += ": Invalid Date/Time, keeping original date time";
                theDate = null;
            }
            
            editReminder(remID, message, theDate);
    
            await interaction.reply({content: "Reminder Edited" + extral, ephemeral: true});
        }

        var massamage = global.ReminderList[remID];
        if (massamage != null)
        {
            var reminderListGroup = getUserReminderAndIDFromID(remID);
            var reminderList = reminderListGroup[0];
            authorID = reminderListGroup[1];
            var massamage2 = await massamage.reply(reminderList);
            massamage.delete();
            global.ReminderMessageExists[massamage.id] = false;

            var finalComps = reminderList.finalComponents;
            if (finalComps != null)
                delete reminderList.finalComponents;
            
            if (reminderList.components != null && reminderList.components[0].components.length > 2)
            {
                handleButtonsEmbedReminders(massamage.channel, massamage2, authorID, finalComps);
            }
            delete global.ReminderList[remID];
        }
    }
    else if (cid.startsWith("deleteReminder-"))
    {
        var remID = cid.split("-")[1];
        var page = cid.split("-")[2];
        var userID = cid.split("-")[3];
        var reminder = getReminder(remID);

        var authorID = interaction.user.id;

        if (reminder == null)
            await interaction.reply({content: "Reminder not found, it may have been deleted/completed already", ephemeral: true});
        else
        {
            authorID = getUserIDFromID(remID);
            removeReminder(remID);
    
            await interaction.reply({content: "Reminder Deleted", ephemeral: true});
        }


        var massamage = global.ReminderList[remID];
        if (massamage != null)
        {
            var reminderList = getUserReminder(authorID, 0);

            var finalComps = reminderList.finalComponents;
            if (finalComps != null)
                delete reminderList.finalComponents;
            
            var massamage2 = await massamage.reply(reminderList);
            massamage.delete();
            global.ReminderMessageExists[massamage.id] = false;
            
            if (reminderList.components != null && reminderList.components[0].components.length > 2)
            {
                handleButtonsEmbedReminders(massamage.channel, massamage2, authorID, finalComps);
            }
            delete global.ReminderList[remID];
        }
    }
    else if (cid.startsWith('pizzaOrder-')) {
        const { babaPizzaOrder } = require('./pizzaFunctions.js');

        await interaction.deferReply({ ephemeral: false });

        const orderID = cid.split('-')[1];
        const orderData = global.pizzaOrders[cid];

        if (!orderData) {
            await interaction.editReply({ content: 'BABA LOST YOUR ORDER! Please start over! 😅' });
            return;
        }

        const address = interaction.fields.getTextInputValue('addressInput');
        const instructions = interaction.fields.getTextInputValue('instructionsInput');

        // Place the order
        const result = await babaPizzaOrder({
            ...orderData,
            address: address || 'Mock address (test mode)',
            instructions,
            userID: interaction.user.id,
            guildID: interaction.guild.id
        });

        // Cleanup global state
        delete global.pizzaOrders[cid];

        await interaction.editReply(result);
    }
}

// ============================================================================
// BUTTON INTERACTION HANDLERS
// ============================================================================

/**
 * Handles button click interactions throughout the bot
 *
 * This function processes various button types with comprehensive permission checking:
 *
 * Permission Validation:
 * - Checks if interaction.message.interaction exists and validates user ownership
 * - Reminder buttons validate against the userID encoded in the button customId
 * - Returns "You cannot use this button" error for unauthorized access
 *
 * Button Types:
 *
 * 1. "editrem-{remID}-{page}-{userID}" - Opens reminder edit modal
 *    - Validates reminder exists in database
 *    - Pre-fills modal with current reminder data (message, date, time)
 *    - Stores message reference in global.ReminderList for live updates
 *    - Formats date/time using locale-specific strings
 *    - Displays mode as "Reminder" or "DM Message" based on source
 *
 * 2. "dismissrem-{remID}-{page}-{userID}" - Dismisses reminder notification
 *    - Does NOT delete the reminder from database
 *    - Only removes the notification message from Discord
 *    - Updates global.ReminderMessageExists tracking
 *    - Provides ephemeral confirmation message
 *
 * 3. "deleterem-{remID}-{page}-{userID}" - Shows delete confirmation modal
 *    - Opens confirmation modal (Discord requires at least one input field)
 *    - Stores message reference for post-deletion list refresh
 *    - Actual deletion happens in modalInfo handler
 *
 * 4. "cursed" - Generates cursed haiku list
 *    - Sets buy parameter to 6 for cursed content
 *    - Removes all interactive components from embed
 *    - Generates paginated embed (5 per page)
 *
 * 5. "purity" / "haiku" / "haiku_list" - Opens haiku/purity search UI
 *    - Creates new global interaction state entry
 *    - Shows different select menus based on mode:
 *      * purity: String select (chans/users/dates) + user select + channel select
 *      * haiku/haiku_list: Only user select + channel select
 *    - Provides "Generate" button to open search form modal
 *    - Stores mode flags: purity (score mode), all (multi-haiku)
 *
 * 6. "generateHaikuList" - Opens the haiku search form modal
 *    - Validates purity mode selection if in purity score mode
 *    - Pre-fills form with previously entered search parameters
 *    - Converts purity mode codes to display names
 *    - Modal includes: keyword, start date, end date, person filters
 *
 * Global State:
 * - global.interactions[messageId]: Stores search parameters and UI state
 * - global.ReminderList[reminderID]: Maps reminders to their message objects
 * - global.ReminderMessageExists[messageId]: Tracks active reminder messages
 *
 * Interaction Flow Examples:
 * - Edit Reminder: Button → Modal → modalInfo handler → Database update → List refresh
 * - Delete Reminder: Button → Confirmation modal → modalInfo handler → Database delete
 * - Haiku Search: Button → Select menus → Generate button → Search modal → Results
 *
 * @param {Discord.ButtonInteraction} interaction - The button interaction from Discord
 * @param {Discord.Client} bot - The Discord bot client instance
 * @returns {Promise<void>}
 */
async function buttonInfo(interaction, bot)
{
    var purity = false;
    var buy = 0;
    var msgstr = "";

	var msg = interaction.message;
    var cid = interaction.customId;

    if (interaction.message.interaction != null && interaction.message.interaction.user.id != interaction.user.id)
    {
        await interaction.reply({content: "You cannot use this button", ephemeral: true});
        return;
    }

    if (cid.startsWith("editrem-"))
    {
        var remID = cid.split("-")[1];
        var page = cid.split("-")[2];
        var userID = cid.split("-")[3];

        if (interaction.user.id != userID)
        {
            await interaction.reply({content: "You cannot use this button", ephemeral: true});
            return;
        }

        var reminder = getReminder(remID);

        if (reminder == null)
        {
            await interaction.reply({content: "Reminder not found, may have been deleted/completed", ephemeral: true});
            return;
        }

        var mode = reminder.Source == "Reminder" ? "Reminder" : "DM Message";

        var theDate = new Date(reminder.Date);

        var timeString = theDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric' });
        var dateString = theDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const modal = new ModalBuilder()
            .setCustomId('editReminder-' + remID + "-" + page + "-" + userID)
            .setTitle('Edit ' + mode);

        const messageInput = new TextInputBuilder()
            .setCustomId('messageInput')
            .setLabel("The Message to Edit")
            .setStyle(1)
            .setRequired(false)
            .setPlaceholder("Message")
            .setValue(reminder.Message == null ? "BLANK BROKE ME ADAM PLEASE" : reminder.Message);

        const dateInput = new TextInputBuilder()
            .setCustomId('dateInput')
            .setLabel("The Date to Edit")
            .setStyle(1)
            .setRequired(false)
            .setPlaceholder("Date")
            .setValue(dateString);

        const timeInput = new TextInputBuilder()
            .setCustomId('timeInput')
            .setLabel("The Time to Edit")
            .setStyle(1)
            .setRequired(false)
            .setPlaceholder("Time")
            .setValue(timeString);

        const firstActionRow = new ActionRowBuilder().addComponents(messageInput);
        const secondActionRow = new ActionRowBuilder().addComponents(dateInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(timeInput);
        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

        global.ReminderList[remID] = interaction.message;
        interaction.showModal(modal);
    }
    else if (cid.startsWith("dismissrem-"))
    {
        var remID = cid.split("-")[1];
        var page = cid.split("-")[2];
        var userID = cid.split("-")[3];

        if (interaction.user.id != userID)
        {
            await interaction.reply({content: "You cannot use this button", ephemeral: true});
            return;
        }

        interaction.reply({content: "Reminder Dismissed", ephemeral: true});
        // delete the message associated with the button
        global.ReminderMessageExists[interaction.message.id] = false;
        interaction.message.delete().catch(function (err) {}); //try to get the message, if it exists delete it
    }
    else if (cid.startsWith("deleterem-"))
    {
        var remID = cid.split("-")[1];
        var page = cid.split("-")[2];
        var userID = cid.split("-")[3];

        if (interaction.user.id != userID)
        {
            await interaction.reply({content: "You cannot use this button", ephemeral: true});
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('deleteReminder-' + remID + "-" + page + "-" + userID)
            .setTitle('Are you sure? Delete Reminder?');

        const confirmInput = new TextInputBuilder()
            .setCustomId('confirmInput')
            .setLabel("Discord need something in popup to work")
            .setStyle(1)
            .setPlaceholder("Close the popup if you no want delete reminder")
            .setRequired(false);

        const firstActionRow = new ActionRowBuilder().addComponents(confirmInput);
        modal.addComponents(firstActionRow);

        global.ReminderList[remID] = interaction.message;
        interaction.showModal(modal);
    }
    else if (cid === "cursed")
    {
        await interaction.deferReply();
        buy = 6;

        var message = await interaction.fetchReply();
        var info = {"ipp": 5, "page": 0}

        var cont = babaHaikuEmbed(purity, buy, msgstr, info);

        for (var i = 0; i < cont.length; i++)
            cont[i].components = null;

        interaction.editReply(cont[info.page]);
    }
    else if (cid === "purity" || cid === "haiku" || cid === "haiku_list")
    {
        await interaction.deferReply({ ephemeral: true });

        var message = await interaction.fetchReply();
        global.interactions[message.id] = {"puritymode" : null, "personList" : null, "channelList" : null};

        global.interactions[message.id]["purity"] = cid === "purity";
        global.interactions[message.id]["all"] = cid === "haiku_list";
        
        var contenenent = {content: "Select Purity Score Information"};
        if (cid === "haiku_list") contenenent.content = "Select Multi-Haiku Information";
        if (cid === "haiku") contenenent.content = "Select Single Haiku Information";

        var row = new Discord.ActionRowBuilder()
            .addComponents(
                new Discord.StringSelectMenuBuilder()
                    .setCustomId('puritymode')
                    .setPlaceholder('Pick which Purity Scores to Show')
                    .addOptions([
                        {
                            label: 'Channels',
                            description: 'Show Purity Score for Channels',
                            value: 'chans',
                        },
                        {
                            label: 'Users',
                            description: 'Show Purity Score for Users',
                            value: 'users',
                        },
                        {
                            label: 'Dates',
                            description: 'Show Purity Score for Dates',
                            value: 'dates',
                        },
                    ]),
            );

        var r2 = new Discord.ActionRowBuilder()
            .addComponents(
                new Discord.UserSelectMenuBuilder()
                    .setCustomId('personList')
                    .setPlaceholder('Pick a Person to Search for')
                    .setMinValues(0)
                    .setMaxValues(25)
            );

        var r3 = new Discord.ActionRowBuilder()
            .addComponents(
                new Discord.ChannelSelectMenuBuilder()
                    .setCustomId('channelList')
                    .setPlaceholder('Pick a Channel to Search for')
                    .setMinValues(0)
                    .setMaxValues(25)
            );

        var r4 = new Discord.ActionRowBuilder()
            .addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId('generateHaikuList')
                    .setLabel(cid === "purity" ? 'Generate Purity Score List' : (cid === "haiku" ? 'Open Haiku Search Form' : 'Open Multi-Haiku Search Form'))
                    .setStyle(1),
            );

        if (cid === "purity")
            contenenent.components = [row, r2, r3, r4];
        else
            contenenent.components = [r2, r3, r4];
        
        interaction.editReply(contenenent);
    }
    else if (cid === "generateHaikuList")
    {
        var msg = interaction.message;
        if (global.interactions[msg.id] === undefined) global.interactions[msg.id] = {"puritymode" : null, "personList" : null, "channelList" : null, "purity" : false, "all" : false};
        
        var pMode = global.interactions[msg.id]["puritymode"];

        if (pMode === null && global.interactions[msg.id]["purity"] === true)
        {
            await interaction.reply({content: "Please Select a Purity Mode", ephemeral: true});
            return;
        }
        else
        {
            if (pMode === "chans")
                pMode = "Channels";
            else if (pMode === "users")
                pMode = "Users";
            else if (pMode === "dates")
                pMode = "Dates";
            
            const modal = new ModalBuilder()
                .setCustomId('haiku-' + (global.interactions[msg.id]["purity"] ? "Purity" : (global.interactions[msg.id]["all"] ? "All" : "Haiku")) + '-' + msg.id)
                .setTitle(global.interactions[msg.id]["purity"] ? 'Purity Score List for ' + pMode : (global.interactions[msg.id]["all"] ? 'Get All Haikus' : 'Get a Random Haiku'))

            const keywordInput = new TextInputBuilder()
                .setCustomId('keywordInput')
                .setLabel("The Keyword to Search for")
                .setStyle(1)
                .setRequired(false)
                .setPlaceholder("Keyword")
                .setValue(global.interactions[msg.id]["keyword"] != null ? global.interactions[msg.id]["keyword"] : "");

            const startDateInput = new TextInputBuilder()
                .setCustomId('startDateInput')
                .setLabel("The Start Date to Search for")
                .setStyle(1)
                .setRequired(false)
                .setPlaceholder("Start Date")
                .setValue(global.interactions[msg.id]["sdate"] != null ? global.interactions[msg.id]["sdate"] : "");
            
            const endDateInput = new TextInputBuilder()
                .setCustomId('endDateInput')
                .setLabel("The End Date to Search for")
                .setStyle(1)
                .setRequired(false)
                .setPlaceholder("End Date")
                .setValue(global.interactions[msg.id]["edate"] != null ? global.interactions[msg.id]["edate"] : "");
            
            const personInput = new TextInputBuilder()
                .setCustomId('personInput')
                .setLabel("The Person to Search for")
                .setStyle(1)
                .setRequired(false)
                .setPlaceholder("Person")
                .setValue(global.interactions[msg.id]["person"] != null ? global.interactions[msg.id]["person"] : "");

            const firstActionRow = new ActionRowBuilder().addComponents(keywordInput);
            const secondActionRow = new ActionRowBuilder().addComponents(startDateInput);
            const thirdActionRow = new ActionRowBuilder().addComponents(endDateInput);
            const fourthActionRow = new ActionRowBuilder().addComponents(personInput);
            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);

            interaction.showModal(modal);
        }
    }
    // ========================================================================
    // PIZZA ORDERING HANDLERS
    // ========================================================================
    else if (cid.startsWith('pizza_')) {
        const { babaPizzaTrack, babaPizzaHistory, calculateOrderPrice } = require('./pizzaFunctions.js');
        const { getUserOrders } = require('./Database/databasePizzaController.js');
        const menuData = require('./Pizza/pizzaMenuData.js');

        const action = cid.replace('pizza_', '');

        if (action === 'order_new') {
            // Show order builder with select menus
            const orderBuilderUI = {
                content: '🍕 **BUILD YOUR PIZZA**\n\nSelect size, crust, and toppings below, then click "Place Order".',
                components: [
                    // Size select menu
                    new ActionRowBuilder().addComponents(
                        new Discord.StringSelectMenuBuilder()
                            .setCustomId('pizza_size')
                            .setPlaceholder('Select pizza size')
                            .addOptions(menuData.sizes.map(s => ({
                                label: s.name,
                                value: s.id,
                                description: `$${s.price.toFixed(2)}`
                            })))
                    ),
                    // Crust select menu
                    new ActionRowBuilder().addComponents(
                        new Discord.StringSelectMenuBuilder()
                            .setCustomId('pizza_crust')
                            .setPlaceholder('Select crust type')
                            .addOptions(menuData.crusts.map(c => ({
                                label: c.name,
                                value: c.id,
                                description: c.price ? `+$${c.price.toFixed(2)}` : 'No extra charge'
                            })))
                    ),
                    // Toppings multi-select
                    new ActionRowBuilder().addComponents(
                        new Discord.StringSelectMenuBuilder()
                            .setCustomId('pizza_toppings')
                            .setPlaceholder('Select toppings (optional)')
                            .setMinValues(0)
                            .setMaxValues(10)
                            .addOptions(menuData.toppings.map(t => ({
                                label: t,
                                value: t.toLowerCase().replace(/ /g, '_')
                            })))
                    ),
                    // Submit button
                    new ActionRowBuilder().addComponents(
                        new Discord.ButtonBuilder()
                            .setCustomId('pizza_confirm_order')
                            .setLabel('Place Order')
                            .setStyle(3)
                            .setEmoji('✅')
                    )
                ]
            };

            // Store in global state
            const tempOrderID = Date.now().toString();
            if (!global.pizzaOrders) {
                global.pizzaOrders = {};
            }
            global.pizzaOrders[tempOrderID] = {
                userID: interaction.user.id,
                size: null,
                crust: null,
                toppings: []
            };

            await interaction.update(orderBuilderUI);
        }
        else if (action === 'track') {
            // Get user's most recent order
            const orders = await getUserOrders(interaction.user.id, 1);
            if (orders.length === 0) {
                await interaction.update({ content: 'BABA FINDS NO ORDERS! Order a pizza first! 🍕', components: [] });
                return;
            }

            const result = await babaPizzaTrack(orders[0].OrderID, null);
            await interaction.update(result);
        }
        else if (action === 'history' || action.startsWith('history_page_')) {
            let page = 0;
            if (action.startsWith('history_page_')) {
                page = parseInt(action.replace('history_page_', ''));
            }
            const result = await babaPizzaHistory(interaction.user.id, page);
            await interaction.update(result);
        }
        else if (action === 'confirm_order') {
            // Find the order data from global state
            const orderData = Object.values(global.pizzaOrders || {}).find(o => o.userID === interaction.user.id);

            if (!orderData || !orderData.size || !orderData.crust) {
                await interaction.update({ content: 'BABA CONFUSED! Please select size and crust first! 🤔', components: [] });
                return;
            }

            // Show confirmation modal with address input
            const modal = new ModalBuilder()
                .setCustomId('pizzaOrder-' + Date.now())
                .setTitle('Confirm Your Pizza Order');

            const addressInput = new TextInputBuilder()
                .setCustomId('addressInput')
                .setLabel('Delivery Address (optional in mock mode)')
                .setStyle(1)
                .setRequired(false)
                .setPlaceholder('123 Main St, City, State ZIP');

            const instructionsInput = new TextInputBuilder()
                .setCustomId('instructionsInput')
                .setLabel('Special Instructions (optional)')
                .setStyle(2)
                .setRequired(false)
                .setPlaceholder('Ring doorbell twice, leave at door, etc.');

            modal.addComponents(
                new ActionRowBuilder().addComponents(addressInput),
                new ActionRowBuilder().addComponents(instructionsInput)
            );

            // Store order data with modal ID for retrieval
            const modalID = 'pizzaOrder-' + Date.now();
            global.pizzaOrders[modalID] = orderData;

            await interaction.showModal(modal);
        }
    }
}

// ============================================================================
// SELECT MENU HANDLERS
// ============================================================================

/**
 * Handles string select menu interactions (dropdown selections)
 *
 * This function processes string-based dropdown menu selections:
 *
 * "puritymode" Select Menu:
 * - Stores the selected purity mode in global interaction state
 * - Available options:
 *   * "chans" - Show purity scores grouped by channels
 *   * "users" - Show purity scores grouped by users
 *   * "dates" - Show purity scores grouped by dates
 *
 * State Management:
 * - Creates global.interactions[messageId] entry if it doesn't exist
 * - Sets default values: puritymode: null, personList: null, channelList: null
 * - Sets purity flag to true to indicate purity score mode
 * - Stores selected value from interaction.values[0]
 *
 * User Feedback:
 * - Replies with ephemeral "puritymode" confirmation
 * - Immediately deletes the reply for cleaner UI
 * - User sees selection update in the select menu without extra messages
 *
 * Integration:
 * - Works with "purity" button interaction flow
 * - Value is read by generateHaikuList button handler
 * - Passed to babaHaikuEmbed for query generation
 *
 * @param {Discord.StringSelectMenuInteraction} interaction - The string select menu interaction
 * @param {Discord.Client} bot - The Discord bot client instance
 * @returns {Promise<void>}
 */
async function stringSelectInfo(interaction, bot)
{
    var cid = interaction.customId;

    if (cid === "puritymode")
    {
        if (global.interactions[interaction.message.id] === undefined) global.interactions[interaction.message.id] = {"puritymode" : null, "personList" : null, "channelList" : null, "purity" : true, "all" : false};
        
        global.interactions[interaction.message.id]["purity"] = true;
        global.interactions[interaction.message.id]["puritymode"] = interaction.values[0];
        
        await interaction.reply({content: "puritymode", ephemeral: true});
        await interaction.deleteReply();
    }
    else if (cid.startsWith('pizza_')) {
        const { calculateOrderPrice } = require('./pizzaFunctions.js');
        const menuData = require('./Pizza/pizzaMenuData.js');

        const action = cid.replace('pizza_', '');
        const values = interaction.values;

        // Find the user's active order
        const orderData = Object.values(global.pizzaOrders || {}).find(o => o.userID === interaction.user.id);

        if (!orderData) {
            await interaction.reply({ content: 'BABA LOST YOUR ORDER! Please start over! 😅', ephemeral: true });
            return;
        }

        if (action === 'size') {
            orderData.size = values[0];
        }
        else if (action === 'crust') {
            orderData.crust = values[0];
        }
        else if (action === 'toppings') {
            orderData.toppings = values;
        }

        // Update message to show current selections
        const currentPrice = calculateOrderPrice(
            orderData.size || 'medium',
            orderData.crust || 'hand_tossed',
            orderData.toppings || []
        );

        const sizeObj = menuData.getSizeById(orderData.size);
        const crustObj = menuData.getCrustById(orderData.crust);
        const toppingNames = (orderData.toppings || []).map(t => menuData.normalizeToppingName(t));

        const summary = `🍕 **YOUR PIZZA ORDER**\n\n` +
            `**Size:** ${sizeObj ? sizeObj.name : 'Not selected'}\n` +
            `**Crust:** ${crustObj ? crustObj.name : 'Not selected'}\n` +
            `**Toppings:** ${toppingNames.length > 0 ? toppingNames.join(', ') : 'None'}\n\n` +
            `**Estimated Price: $${currentPrice.toFixed(2)}**\n\n` +
            `Select more options below, then click "Place Order" when ready!`;

        await interaction.update({ content: summary });
    }
}

/**
 * Handles user select menu interactions (user picker dropdowns)
 *
 * This function processes user selection from Discord's user picker component:
 *
 * "personList" Select Menu:
 * - Stores selected user IDs in global interaction state
 * - Supports multi-select: 0-25 users can be selected
 * - Used for filtering haiku/purity searches by specific users
 *
 * State Management:
 * - Creates global.interactions[messageId] entry if it doesn't exist
 * - Sets default values: puritymode: null, personList: null, channelList: null
 * - Stores array of user IDs from interaction.values
 * - Flags: purity: false, all: false (not in purity/multi mode by default)
 *
 * User Feedback:
 * - Replies with ephemeral "personList" confirmation
 * - Immediately deletes the reply for cleaner UI
 * - Selected users remain visible in the select menu component
 *
 * Integration:
 * - Works with "purity", "haiku", and "haiku_list" button flows
 * - User IDs are retrieved in modalInfo haiku handler
 * - Combined with manual person input field in search modal
 * - Format: "{manualInput}---{selectedUserIds}" in final query
 *
 * Data Flow:
 * - User clicks purity/haiku button → Select menu shown
 * - User picks people → Stored in global.interactions
 * - User clicks generate → Modal shown with text input
 * - Modal submitted → Combines both sources for search
 *
 * @param {Discord.UserSelectMenuInteraction} interaction - The user select menu interaction
 * @param {Discord.Client} bot - The Discord bot client instance
 * @returns {Promise<void>}
 */
async function userSelectInfo(interaction, bot)
{
    var cid = interaction.customId;

    if (cid === "personList")
    {
        if (global.interactions[interaction.message.id] === undefined) global.interactions[interaction.message.id] = {"puritymode" : null, "personList" : null, "channelList" : null, "purity" : false, "all" : false};
        
        global.interactions[interaction.message.id]["personList"] = interaction.values;
        await interaction.reply({content: "personList", ephemeral: true});
        await interaction.deleteReply();
    }
}

/**
 * Handles channel select menu interactions (channel picker dropdowns)
 *
 * This function processes channel selection from Discord's channel picker component:
 *
 * "channelList" Select Menu:
 * - Stores selected channel IDs in global interaction state
 * - Supports multi-select: 0-25 channels can be selected
 * - Used for filtering haiku/purity searches by specific channels
 *
 * State Management:
 * - Creates global.interactions[messageId] entry if it doesn't exist
 * - Sets default values: puritymode: null, personList: null, channelList: null
 * - Stores array of channel IDs from interaction.values
 * - Flags: purity: false, all: false (not in purity/multi mode by default)
 *
 * User Feedback:
 * - Replies with ephemeral "channelList" confirmation
 * - Immediately deletes the reply for cleaner UI
 * - Selected channels remain visible in the select menu component
 *
 * Integration:
 * - Works with "purity", "haiku", and "haiku_list" button flows
 * - Channel IDs are retrieved in modalInfo haiku handler
 * - Converted to comma-separated string for database query
 * - Used to filter haiku search results to specific channels
 *
 * Data Flow:
 * - User clicks purity/haiku button → Select menu shown
 * - User picks channels → Stored in global.interactions
 * - User clicks generate → Modal shown with additional filters
 * - Modal submitted → Channel IDs included in search query
 * - Empty array results in null (search all channels)
 *
 * @param {Discord.ChannelSelectMenuInteraction} interaction - The channel select menu interaction
 * @param {Discord.Client} bot - The Discord bot client instance
 * @returns {Promise<void>}
 */
async function channelSelectInfo(interaction, bot)
{
    var cid = interaction.customId;

    if (cid === "channelList")
    {
        if (global.interactions[interaction.message.id] === undefined) global.interactions[interaction.message.id] = {"puritymode" : null, "personList" : null, "channelList" : null, "purity" : false, "all" : false};

        global.interactions[interaction.message.id]["channelList"] = interaction.values;
        await interaction.reply({content: "channelList", ephemeral: true});
        await interaction.deleteReply();
    }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

/**
 * Exported interaction handlers for Discord component interactions
 *
 * These functions are called by the main bot event handler based on interaction type:
 * - contextInfo: Called when user right-clicks on a message (context menu)
 * - modalInfo: Called when user submits a modal form
 * - buttonInfo: Called when user clicks a button component
 * - stringSelectInfo: Called when user selects from a dropdown menu
 * - userSelectInfo: Called when user picks users from user select menu
 * - channelSelectInfo: Called when user picks channels from channel select menu
 *
 * All handlers follow the same signature: (interaction, bot) => Promise<void>
 */
module.exports = {
	contextInfo,
    modalInfo,
    buttonInfo,
    stringSelectInfo,
    userSelectInfo,
    channelSelectInfo
}