/**
 * @fileoverview Command Implementation Functions for Baba Discord Bot
 *
 * Contains the core implementation logic for 40+ bot commands including:
 * - Friday frog system with birthday overlays
 * - Random number generation and "please" responses
 * - Haiku database search and display
 * - Weather and hurricane tracking
 * - Aurora borealis forecasts
 * - Holiday progress bars and countdowns
 * - Calendar integration
 * - YUGO car Easter egg
 * - Various fun commands (cat, pizza, coin flip, etc.)
 *
 * These functions are called by slash command handlers in /Commands directory.
 * Most functions return Discord message objects with {content, embeds, files} structure.
 *
 * @module commandFunctions
 */

var babadata = require('../babotdata.json'); //baba configuration file

const fs = require('fs');
const Jimp = require('jimp');
const https = require('https');
var PublicGoogleCalendar = require('public-google-calendar');

const Discord = require('discord.js'); //discord module for interation with discord api

const { reverseDelay } = require("./HelperFunctions/remindersByBaba.js");
const { getD1 } = require("../Tools/overrides.js");
const { FormatPurityList, HaikuSelection, ObtainDBHolidays, NameFromUser } = require("./Database/databaseandvoice.js");
const { FindDate, GetDate, dateDiffInDays, getTimeFromString, progressSimple } = require("./HelperFunctions/basicHelpers.js");
const { CheckHoliday, FindNextHoliday, MakeImage, EmbedHaikuGen, checkHurricaneStuff, monthFromInt } = require("./HelperFunctions/commandHelpers.js");
const { normalizeMSG } = require("./HelperFunctions/dbHelpers.js");

const options = { year: 'numeric', month: 'long', day: 'numeric' }; // for date parsing to string

/**
 * Generates Friday frog image with optional birthday celebration overlay
 *
 * If today is someone's birthday (global.BirthdayToday), overlays their name(s)
 * on the Friday image using Jimp at coordinates (500, 235) centered. Otherwise
 * returns static Friday.jpg. For fake Friday detection, shows different alt text.
 *
 * Uses Jimp to:
 * - Load Friday.jpg base image
 * - Load FONT_SANS_32_BLACK font
 * - Calculate centered text position
 * - Print birthday names with " Edition!" suffix
 * - Convert to JPEG buffer
 *
 * @param {boolean} [isFake=false] - If true, shows "YOU THINK IT IS FRIDAY??" message
 * @returns {Object} Discord message object with content and Friday image attachment
 */
async function babaFriday(isFake = false)
{
    alttext = isFake ? "YOU THINK IT IS FRIDAY??" : "Baba Friday Image, As it is ALWAYS Friday!"
    var templocal = babadata.datalocation + "FrogHolidays/"; //creates the output frog image

    var newFile = null;
    if (!isFake && global.BirthdayToday != null)
    {
        var font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
        var image = await Jimp.read(templocal + "Friday.jpg");

        var names = global.BirthdayToday;
        var name = names.join(" and ");
        name = name + " Edition!";

        var nameWidth = Jimp.measureText(font, name);
        var nameHeight = Jimp.measureTextHeight(font, name, 500);

        var nameX = 500 - nameWidth / 2;
        var nameY = 235 - nameHeight / 2;

        image.print(font, nameX, nameY, name);

        alttext = "Baba Friday Image, As it is ALWAYS Friday!\nCelebrating: " + names.join(" and ") + " Edition!";

        newFile = new Discord.AttachmentBuilder(await image.getBufferAsync(Jimp.MIME_JPEG), { name: 'Friday.jpg', description : alttext });
    }
    else
    {
        newFile = new Discord.AttachmentBuilder(templocal + "Friday.jpg", { name: 'Friday.jpg', description : alttext });
    }

    return { content: "FRIDAY!", files: [newFile] };
}

/**
 * Generates random number within specified range with optional spoiler formatting
 *
 * Uses Math.random() to generate inclusive random integer between min and max.
 * If spoiler is true, wraps result in Discord spoiler tags (||number||).
 *
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @param {boolean} spoiler - If true, wraps number in Discord spoiler tags
 * @returns {Object} Discord message object with content property containing the random number
 */
function babaRNG(min, max, spoiler)
{
    var num = Math.floor(Math.random() * (max - min + 1)) + min;
    return { content: "Your Random Number is: " + (spoiler ? "||" : "")  + num + (spoiler ? "||" : "") };
}

/**
 * Returns random response when user says "please" to Baba
 *
 * RNG logic with weighted probabilities:
 * - 2% chance: "AAAAAAAAAAA" (panic response)
 * - 13% chance: "BABA IS HAPPY!"
 * - 30% chance: "BABA IS THANKS!"
 * - 23% chance: "BABA IS PLEASED!"
 * - 1% chance: "Nice!" (when roll is exactly 69)
 * - ~31% chance: undefined/no response
 *
 * @returns {Object|undefined} Discord message object with content, or undefined
 */
function babaPlease()
{
    var num = Math.floor(Math.random() * 100); //pick a random one
    if (num < 2)
        return { content: "AAAAAAAAAAA" }
    else if (num < 15)
        return { content: "BABA IS HAPPY!" };
    else if (num < 45)
        return { content: "BABA IS THANKS!" };
    else if (num < 68)
        return { content: "BABA IS PLEASED!" };
    else if (num == 69)
        return { content: "Nice!" };
}

/**
 * Placeholder for future pizza ordering feature
 *
 * @returns {Object} Discord message object with coming soon message
 */
function babaPizza()
{
    return { content: "Baba Pizza Ordering Service™ coming soon!" };
}

/**
 * Generates random progress bar with specified length
 *
 * Delegates to progressSimple helper function to create ASCII progress bar
 * with random completion percentage.
 *
 * @param {number} [n=20] - Length of progress bar in characters
 * @returns {Object} Discord message object with progress bar content
 */
function babaProgress(n = 20)
{
    var pb = progressSimple(n);

    return { content: pb };
}

/**
 * Generates comprehensive help text listing all available Baba commands
 *
 * Displays command syntax and descriptions for:
 * - Server utilities (password, vibe flag, yugo)
 * - Haiku system (random, by person, purity tracking)
 * - Holiday/date commands (wednesday, days until, when is, day of week)
 * - Fun commands (friday, pizza, please)
 *
 * @returns {Object} Discord message object with formatted help text in code block
 */
function babaHelp()
{
    var helptext = "BABA IS HELP"
    helptext += "\n```Commands:"

    helptext += "\nAll commands can be run as slash commands!";

    helptext += "\n" + "- !baba password - Gets the server password for games!"
    helptext += "\n" + "- !baba [night shift | vibe time] flag - Gets the current vibe time flag for the day!"
    helptext += "\n" + "- !baba make yugo - Baba will give you a yugo!"

    helptext += "\n" + "- !baba haiku - Pulls a random haiku from the haiku database of the server!"
    helptext += "\n" + "- !baba haiku by [person] - Gets a random haiku make by the specified person!"
    helptext += "\n" + "- !baba haiku purity list [channels] - Gets a list of all people or channels haiku purity's!"
    helptext += "\n" + "- !baba my haiku purity - Gets the haiku purity of the sender!"
    helptext += "\n" + "- !baba haiku purity [channel/person/date] - Gets the haiku purity of the the specified value!"

    helptext += "\n" + "- !baba wednesday {holiday} - Displays a frog with how many wednesdays until the specified holiday!"
    helptext += "\n" + "- !baba days until {holiday} - Displays how many days until specified holiday!"
    helptext += "\n" + "- !baba when is {holiday} - Displays the exact date of the specified holiday!"
    helptext += "\n" + "- !baba day of week {holiday} - Displays what day of week the specified holiday is!";

    helptext += "\n" + "- !baba friday - Displays the friday image!";
    helptext += "\n" + "- !baba order pizza - Baba will order you a pizza (coming soon)!";
    helptext += "\n" + "- !baba please - >:(";
    helptext += "```"

    return { content: helptext };
}

/**
 * Generates daily Night Shift/Vibe Time flag based on seeded RNG algorithm
 *
 * Calculates which of 7 flag variants to show based on:
 * - Current date adjusted for Wednesday-shifted calendar
 * - Seed calculation: (date % 9) + (month % 5)
 * - Lookup through 7x7 matrix of flag indices
 * - Final index: locals[seed % 7][(dayOfWeek + adjustedDate) % 7]
 *
 * The algorithm ensures same flag shows for entire day but varies by date.
 * Flag images stored in /Flags/ directory as Night_Shift_0.png through Night_Shift_6.png.
 *
 * @returns {Object} Discord message object with "BABA IS AT VIBE TIME" and flag image attachment
 */
function babaVibeFlag()
{
    var d1 = getD1();
    var flagtext = "BABA IS AT VIBE TIME";; //V I B E  T I M E
    let d1_useage = new Date(d1.getFullYear(), d1.getMonth(), 1); //today that has been wednesday shifted
    d1_useage.setDate(d1.getDate() - d1.getDay()); //modify today for wed

    d1_useage.setDate(d1_useage.getDate() + (d1_useage.getMonth() % 7)); //modify today for wed

    var seed = (d1_useage.getDate() % 9) + (d1_useage.getMonth() % 5); //seeds are cool

    var locals = [ //another thing hank doesnt like, but it is needed
        [0,1,2,3,4,5,6],
        [6,5,4,3,2,1,0],
        [1,3,5,0,2,4,6],
        [0,2,4,6,5,3,1],
        [0,4,5,1,2,6,2],
        [5,6,1,4,3,2,0],
        [4,0,6,2,1,5,3]
    ]

    var sood = locals[seed % 7][(d1.getDay() + d1_useage.getDate()) % 7]; // "the mommy number and daddy numbers get drunk and invite cousins" - Caden 2021

    // var newAttch = new Discord.MessageAttachment().setFile(); //makes a new discord attachment
    var newFile = new Discord.AttachmentBuilder(babadata.datalocation + "Flags/" + "Night_Shift_" + sood + ".png",
        { name: 'NightShift.png', description : "This one is indexed as " + sood + "!" });

    return {content: flagtext, files: [newFile] };

}

/**
 * Returns random Yugo car image from collection
 *
 * Selects random image from 11 yugo images (0.jpg through 10.jpg) in /Yugo/ directory.
 * Images are Yugo cars, a notoriously unreliable Yugoslavian automobile.
 *
 * @returns {Object} Discord message object with "Here Yugo!" text and random yugo image attachment
 */
function babaYugo()
{
    var yugotext = "Here Yugo!";
    var num = Math.floor(Math.random() * 11); //pick a random one
    var yugo = new Discord.AttachmentBuilder(babadata.datalocation + "Yugo/" + num.toString() + ".jpg",
        { name: 'Yugo.jpg', description : "This is yugo number " + num + "!\nHere Yugo, Get IT, GET IT! HHUEHUEHEUHEHEUEUEHUEHUEHUE!" });

    return { content: yugotext, files: [yugo] };
}

/**
 * Returns random repost meme image when content is detected as repost
 *
 * Selects from 5 repost images (0.png through 4.png) in /Repost/ directory.
 * Used when bot detects duplicate content (awaiting Jeremy's repost detector implementation).
 *
 * @returns {Object} Discord message object with random repost meme image attachment
 */
function babaRepost()
{
    var num = Math.floor(Math.random() * 5); //pick a random one
    var reppy = new Discord.AttachmentBuilder(babadata.datalocation + "Repost/" + num.toString() + ".png",
        { name: 'Repost.png', description : "This is repost number " + num + "!\nWhen will jeremy finish his report detector?"});
    return { files: [reppy] };
}

/**
 * Extracts URL buttons from haiku message components and rebuilds them
 *
 * Scans through Discord message components to find URL-style buttons (style 5)
 * and recreates them as "View Source" buttons for haiku messages. This preserves
 * links to original messages where haikus were detected.
 *
 * @param {Array} cont - Array of Discord ActionRow components from previous message
 * @returns {Array} Array of ActionRow arrays containing reconstructed URL buttons
 */
function babaHaikuLinks(cont)
{
    var deadData = [];
    for (var i = 0; i < cont.length; i++)
    {
        var cpu = cont[i].components[0].components;
        // if cont[i].components[0].components[cpu.length - 1].data.style == 5
        if (cont[i].components[0].components[cpu.length - 1].data.style == 5)
        {
            var row = new Discord.ActionRowBuilder();
            var URLButton = new Discord.ButtonBuilder().setURL(cont[i].components[0].components[cpu.length - 1].data.url).setLabel("View Source").setStyle(5);
            row.addComponents(URLButton);

            var cpu2 = [row];
            deadData.push(cpu2);
        }
    }

    return deadData;
}

/**
 * Generates Discord embed for haiku display or purity list
 *
 * Two modes of operation:
 * 1. Purity mode (purity=true): Shows haiku purity statistics for users/channels/dates
 *    - Formats purity list from database
 *    - Groups by users, channels, or dates based on msgContent[6]
 *    - Supports pagination via pagestuff
 * 2. Haiku mode (purity=false): Displays random haiku from database
 *    - Selects haiku via HaikuSelection based on filters
 *    - Formats as embed via EmbedHaikuGen
 *
 * Message content normalization depends on mode (mode 4 requires array iteration).
 *
 * @param {boolean} purity - If true, show purity list; if false, show haiku
 * @param {number} mode - Selection mode for database query
 * @param {string|Array} msgContent - Filter criteria (string or array based on mode)
 * @param {Object} pagestuff - Pagination settings with ipp (items per page) property
 * @returns {Array} Array of Discord message objects with embeds
 */
function babaHaikuEmbed(purity, mode, msgContent, pagestuff)
{
    if (mode != 4)
        msgContent = normalizeMSG(msgContent);
    else
    {
        for (var i = 0; i < msgContent.length; i++)
        {
            if (typeof(msgContent[i]) == "string")
                msgContent[i] = normalizeMSG(msgContent[i]);
        }
    }

    if (purity)
    {
        var hpl = {"retstring": ["No Haiku Purity Found!"], "total": 1};
        var bonust = ""
        var bonupr = ""
        var haifou = false;

        bonust = " List for ";
        bonust += (msgContent[6] == "chans" ? "Channels" : (msgContent[6] == "dates" ? "Dates" : "Users"));
        var result = HaikuSelection(msgContent, mode);

        if (result == null)
        {
            haifou = true;
            return [{content: "Result was null, something may have gone wrong, or no Haikus were found!"}];
        }

        hpl = FormatPurityList(result, (msgContent[6] == "chans" ? true : (msgContent[6] == "dates" ? 2 : false)), pagestuff);

        if (hpl.retstring.length != 0)
        {
            haifou = true;
            return EmbedPurityGen(hpl, bonust, bonupr, pagestuff, msgContent);
        }
        else hpl = {"retstring": ["No Haiku Purity Found based on Selections"], "total": 1};

        if (!haifou)
            return EmbedPurityGen(hpl, bonust, bonupr, pagestuff);
    }
    else
    {
        var haikussimnames = HaikuSelection(msgContent, mode);
        if (haikussimnames == null) return [{content: "No Haiku Found, or the DB is Disabled!"}];

        var haiku = haikussimnames[0];
        var simnames = haikussimnames[1];
        //console.log(haiku, true);

        return EmbedHaikuGen(haiku, simnames);
    }
}

/**
 * Generates paginated Discord embeds for haiku purity statistics
 *
 * Creates multi-page embeds showing haiku purity data with:
 * - Filter summary (users, channels, keywords, date ranges)
 * - Pagination buttons (Previous/Next) if multiple pages needed
 * - Random hex color generation (50% chance of 0 or F for each digit)
 * - Footer with Baba icon and page numbers
 *
 * Filter parsing from msgContent array:
 * - [0]: start date, [1]: end date, [2]: channels, [3]: persons
 * - [4]: keywords, [5]: unused, [6]: grouping type
 *
 * Date ranges support exact dates or wildcard patterns (ANY Month/Day/Year).
 * Uses global.userCache and global.channelCache for ID-to-name resolution.
 *
 * @param {Object} hpl - Haiku purity list with retstring array and total count
 * @param {string} bonust - Bonus title text (e.g., " List for Channels")
 * @param {string} bonupr - Bonus prefix text (currently unused)
 * @param {Object} pagestuff - Pagination config with ipp (items per page)
 * @param {Array} [msgContent] - Filter criteria array, optional
 * @returns {Array} Array of Discord message objects with embeds and pagination components
 */
function EmbedPurityGen(hpl, bonust, bonupr, pagestuff, msgContent)
{
    var objs = [];
    var pagetotal = Math.ceil(hpl.total / pagestuff.ipp);
    for (var e = 0; e < pagetotal; e++)
    {
        var obj = {content: "BABA MAKE HAIKU"};
        if (msgContent != undefined)
        {
            var sd = msgContent[0];
            var startDate = null;
            var ed = msgContent[1];
            var endDate = null;
            var chan = msgContent[2];
            var pson = msgContent[3];
            var kword = msgContent[4];

            var cont = "BABA MAKE HAIKU\n";
            cont += "```\n";

            if (pson != null)
            {
                var ppl2s = pson.split("---");
                cont += "Users: \n";
                if (ppl2s[1] != "")
                {
                    var ids = ppl2s[1].split(",");

                    cont += "\t-> " + ids.map(id => global.userCache[id].PersonName).join(", ") + "\n";
                }
                if (ppl2s[0] != "")
                {
                    cont += "\t-> " + ppl2s[0] + "\n";
                }
            }

            if (chan != null)
            {
                var chans = chan.split(",");
                cont += "Channels: \n";
                cont += "\t-> " + chans.map(id => global.channelCache[id]).join(", ") + "\n";
            }

            if (kword != null)
                cont += "Containing: " + kword.split(" ").join(", ") + "\n";

            if (sd != null || ed != null)
            {
                if (sd != null)
                    startDate = FindDate(sd);
                if (ed != null)
                    endDate = FindDate(ed);

                if (startDate == null && endDate != null) startDate = endDate;

                if (startDate != null)
                {
                    var d1 = new Date(startDate.year, startDate.month - 1, startDate.day);
                    if (endDate != null)
                    {
                        var d2 = new Date(endDate.year, endDate.month - 1, endDate.day);
                        if (endDate < startDate)
                        {
                            var temp = startDate;
                            startDate = endDate;
                            endDate = temp;
                        }

                        cont += "From: " + d1.toLocaleDateString('en-US', options) + "\n";
                        cont += "To: " + d2.toLocaleDateString('en-US', options) + "\n";
                    }
                    else
                    {
                        cont += "Occuring On: " + d1.toLocaleDateString('en-US', options) + "\n";
                    }
                }
                else if (sd != null)
                {
                    startDate = FindDate(sd, true);
                    if (startDate != null)
                    {
                        var year = startDate.year;
                        var month = startDate.month;
                        var day = startDate.day;

                        month = (month == 0) ? month = "ANY Month" : monthFromInt(month)
                        day = (day == 0) ? day = "ANY Day" : day;
                        year = (year == 0) ? year = "ANY Year" : year;

                        cont += "Occuring On Any Instance of: " + `${month} ${day}, ${year}` + "\n";
                    }
                }
            }

            //remove last newline
            cont = cont.substring(0, cont.length - 1);
            cont += "```\n";

            if (msgContent[0] == null && msgContent[1] == null && msgContent[2] == null && msgContent[3] == null && msgContent[4] == null)
                cont = "BABA MAKE HAIKU";

            obj = {content: cont};
        }

        var footer = "Haikus by Baba!";
        if (pagetotal > 1)
        {
            footer += " - Page " + (1 + e) + " of " + pagetotal;
            var row = new Discord.ActionRowBuilder();

            var pButton = new Discord.ButtonBuilder().setCustomId("page"+(e - 1)).setLabel("Previous").setStyle(1);
            var nButton = new Discord.ButtonBuilder().setCustomId("page"+(1 + e)).setLabel("Next").setStyle(1);
            if (e == 0)
            {
                pButton.setDisabled(true);
            }
            if (e == pagetotal - 1)
            {
                nButton.setDisabled(true);
            }

            row.addComponents(pButton, nButton);
            obj.components = [row];
        }

        var footobj = {
            text : footer,
            iconURL : "https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png"
        };

        var exampleEmbed = new Discord.EmbedBuilder() // embed for the haiku
        .setColor("#" + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F"))
        .setTitle(bonupr + "Haiku Purity" + bonust)
        .setDescription(hpl.retstring[e])
        .setFooter(footobj);
        obj.embeds = [exampleEmbed];
        objs.push(obj);
    }

    return objs;
}


/**
 * Calculates days until next Wednesday or since last Wednesday
 *
 * Shifts week to make Wednesday = 0, calculates difference from current day.
 * Uses modulo arithmetic: (currentDay + 4) % 7 to shift Sunday=0 to Wednesday=0.
 *
 * @param {number} [since=1] - If 1, counts forward to next Wednesday; if -1, counts backward to last
 * @returns {Object} Discord message object with day count until/since Wednesday
 */
function babaDayNextWed(since = 1)
{
    var seven  = 7 * since;
    let d1 = getD1(); //get today
    var dow_d1 = (d1.getDay() + 4) % 7;//get day of week (making wed = 0)

    var dtnw = ""
    var ct = Math.abs(seven - dow_d1);
    if (ct > 7) ct -= 7;

    if (ct == 1)
        dtnw = "\nIt is only " + ct + " day " + (since == 1 ? "until" : "since") + " the " + (since == 1 ? "next" : "last") + " Wednesday!"
    else
        dtnw = "\nIt is only " + ct + " days " + (since == 1 ? "until" : "since") + " the " + (since == 1 ? "next" : "last") + " Wednesday!"

    return { content: dtnw };
}

/**
 * Generates random adjective-animal combination string
 *
 * Loads adjectives and animals arrays from data.json, selects one random entry
 * from each, removes spaces from animal name, concatenates as single word.
 * Returns in code block formatting. Used for random username generation.
 *
 * @returns {Object} Discord message object with random adjective+animal in code block
 */
function babaJeremy()
{
    var data = JSON.parse(fs.readFileSync(babadata.datalocation + "data.json", {encoding:'utf8', flag:'r'}));
    var adjective = data.adjectives[Math.floor(Math.random() * data.adjectives.length)];
    var animal = data.animals[Math.floor(Math.random() * data.animals.length)].replaceAll(' ', '');

    return { content: "```" + adjective + animal + "```" };
}

/**
 * Generates holiday/event countdown images with multiple display modes
 *
 * Complex multi-mode function supporting:
 * - Wednesday frog countdown images (weeks until holiday)
 * - Custom day-of-week countdowns (any day, not just Wednesday)
 * - Text-only modes: "when is", "days until", "days since", "day of week"
 * - Special keywords: "next event", "next birthday", "eves" (eve repetition)
 * - Date input parsing and holiday database lookups
 *
 * Image generation (Wednesday mode):
 * - Uses Jimp to composite base image + text overlay
 * - Calculates weeks between Wednesday-adjusted dates
 * - Generates custom output images: outputfrog_N.png
 * - Falls back to error.png if holiday image missing
 * - Shows special images when event is today (holidayname.png)
 *
 * Date calculations:
 * - Adjusts current date and target date to same day-of-week baseline
 * - Divides time difference by (3600000ms * 24hrs * 7days) for weeks
 * - Rounds weeks < 0.3 to 0 (same week threshold)
 *
 * Text modes via msgContent keywords:
 * - "when is": Discord timestamp of event date
 * - "when isnt": Random fake date ±364 days ±5 years
 * - "days until": Relative time with day count if >31 days
 * - "days since": Same as above but for past events
 * - "day of week": Day name (Monday, Tuesday, etc.)
 * - "eves": Repeats "eve " for each day, max 450 per message block
 *
 * @param {string} msgContent - Message text containing holiday name and mode keywords
 * @param {Object} author - Discord user object (currently unused)
 * @param {string} DOWChosen - Day of week code: "01"-"07" or "00" for auto-detect
 * @returns {Array} Array of Discord message objects with text and/or frog images
 */
async function babaUntilHolidays(msgContent, author, DOWChosen)
{
    msgContent = normalizeMSG(msgContent);
    var outs = [];

    var holidays = ObtainDBHolidays();

    //get the holidays that are reqested and the date if it is a date
    var IsHoliday = CheckHoliday(msgContent, holidays);
    var IsDate = FindDate(msgContent);
    if (IsDate != null)
        IsHoliday.push(IsDate);

    var d1 = getD1(); //get today
    var yr = d1.getFullYear();

    if (msgContent.includes('next event'))
    {
        var hols = FindNextHoliday(d1, yr, CheckHoliday("ALL", holidays));
        for (var i = 0; i < hols.length; i++) // Add all the events to the list that are coming up
            IsHoliday.push(hols[i]);
    }
    
    if (msgContent.includes('next birthday'))
    {
        var hols = FindNextHoliday(d1, yr, CheckHoliday("BIRTHDAY", holidays));
        for (var i = 0; i < hols.length; i++) // Add all the birthdays to the list that are coming up
            IsHoliday.push(hols[i]);
    }

    if(IsHoliday.length > 0)
    {
        var templocationslist = [];
        for ( var i = 0; i < IsHoliday.length; i++) //loop through the holidays that are requested
        {
            var holidayinfo = IsHoliday[i];
            if (holidayinfo.name != "date" && holidayinfo.year)
            {
                yr = holidayinfo.year;
                var tempDate = new Date(yr, holidayinfo.month - 1, holidayinfo.day);
                if (tempDate < d1)
                    yr--;
            }

            console.log("holidayinfo: " + holidayinfo.name);
            var d2 = GetDate(d1, yr, holidayinfo);

            if (isNaN(d2))
            {
                var fronge = new Discord.AttachmentBuilder(babadata.datalocation + "FrogHolidays/error.png", 
                    { name: 'ErrorFrog.png', description : "Brug, run commands better bud hee!"});

                outs.push({ content: "The date does not exist so BABA will give you ERROR frog!", files: [fronge] });
                continue;
            }

            var additionaltext = "";
            var showwed = false;

            var dowtext = "";

            if (DOWChosen == "00")
                DOWChosen = "0" + (d1.getDay() + 1);

            if (DOWChosen == "01")
                dowtext = "sunday";
            else if (DOWChosen == "02")
                dowtext = "monday";
            else if (DOWChosen == "03")
                dowtext = "tuesday";
            else if (DOWChosen == "04")
                dowtext = "wednesday";
            else if (DOWChosen == "05")
                dowtext = "thursday";
            else if (DOWChosen == "06")
                dowtext = "friday";
            else if (DOWChosen == "07")
                dowtext = "saturday";

            if (msgContent.includes(dowtext))
                showwed = true;
            
            if (msgContent.includes('when is')) //outputs the next occurance of the event
            {
                var timed = d2.getTime() / 1000;
                var ison = " is on ";
                
                if (msgContent.includes('when isnt') || msgContent.includes('when is not') || msgContent.includes('when isn\'t'))
                {
                    // add a random number of days to d2 either before or after the date
                    var days = Math.floor(Math.random() * 364) + 1;

                    // add a random number of years from 0 to 5 either before or after the date
                    var years = Math.floor(Math.random() * 5);

                    var before = Math.random() < 0.5;
                    var before2 = Math.random() < 0.5;

                    var d3po = new Date(d2);
                    d3po.setDate(d2.getDate() + (before ? -days : days));
                    d3po.setFullYear(d2.getFullYear() + (before2 ? -years : years));

                    timed = d3po.getTime() / 1000;
                    ison = " is not on ";
                }

                var bonustext = holidayinfo.year != undefined ? " " + holidayinfo.year : "";

                var whenistext = "";
                if (IsDate != null)
                {
                    if (ison == " is not on ")
                        whenistext += "\n<t:" + (d2.getTime() / 1000) + ":D> is not on " + "<t:" + timed + ":D>";
                    else
                        whenistext += "\n<t:" + timed + ":D>";
                }
                else
                {
                    if (holidayinfo.year != undefined)
                        whenistext += "\n" + holidayinfo.safename + bonustext + ison + "<t:" + timed + ":D>";
                    else
                        whenistext += "\nThe next occurance of " + holidayinfo.safename + ison + "<t:" + timed + ":D>";
                }
                
                additionaltext += whenistext + "\n";
            }

            if (msgContent.includes('day of week')) //custom days until text output - for joseph
            {
                var bonustext = holidayinfo.year != undefined && holidayinfo.year != 0 ? " " + holidayinfo.year : "";
                var dowtext = holidayinfo.safename + bonustext + " is on " + d2.toLocaleDateString('en-US', {weekday: 'long'}); //future text
                
                additionaltext += dowtext + "\n";
            }

            if (msgContent.includes('days until')) //custom days until text output - for joseph
            {
                var int = dateDiffInDays(d1, d2); //convert to days difference
                var bonustext = holidayinfo.year != undefined && holidayinfo.year != 0 ? " " + holidayinfo.year : "";

                dutext = holidayinfo.safename + bonustext + " is ";

                if (int != 0)
                    dutext += "<t:" + d2.getTime() / 1000 + ":R>" + (int > 31 ? " which is in " + int + " day" + (int == 1 ? "" : "s") : "!");
                else
                {
                    dutext += "Today!";
                    showwed = true;
                }

                additionaltext += dutext + "\n";
            }

            if (msgContent.includes('days since')) //custom days until text output - for joseph
            {
                var int = dateDiffInDays(d1, d2); //convert to days difference
                int = Math.abs(int);
                var bonustext = holidayinfo.year != undefined && holidayinfo.year != 0 ? " " + holidayinfo.year : "";

                dutext = holidayinfo.safename + bonustext + " is ";

                if (int != 0)
                    dutext += "<t:" + d2.getTime() / 1000 + ":R>" + (int > 31 ? " which was " + int + " day" + (int == 1 ? "" : "s") : " ago!");
                else
                {
                    dutext += "Today!";
                    showwed = true;
                }

                additionaltext += dutext + "\n";
            }

            if (msgContent.includes("eves"))
            {
                var int = dateDiffInDays(d1, d2); //convert to days difference
                int = Math.abs(int);
                var bonustext = holidayinfo.year != undefined && holidayinfo.year != 0 ? " " + holidayinfo.year : "";

                var eves = "";
                var evesCloner = "eve ";
                var HundredGroups = Math.ceil(int / 450);
                for (var j = 0; j < HundredGroups; j++)
                {
                    var newInt = 450;
                    if (j == HundredGroups - 1 && int % 450 != 0)
                        newInt = int % 450;

                    eves += evesCloner.repeat(newInt);
                    eves = eves.trim();
                    eves += "\n";
                }
                eves = eves.trim();

                // if today is before d2
                if (d1 < d2)
                    additionaltext += "Today is " + holidayinfo.safename + bonustext + " " + eves + "!\n";
                else
                    additionaltext += holidayinfo.safename + bonustext + " is Today " + eves + "!\n";
            }

            if (additionaltext !== "")
            {
                outs.push({ content: additionaltext });

                if (!showwed)
                    continue;
            }

            var dow_d1 = (d1.getDay() + parseInt(DOWChosen)) % 7; // get day of week (making wed = 0)
            let d1_useage = new Date(d1.getFullYear(), d1.getMonth(), 1); // today that has been wednesday shifted
            d1_useage.setDate(d1.getDate() - dow_d1); // modify today for wednesdays

            var dow_d2 = (d2.getDay() + parseInt(DOWChosen)) % 7; // get day of week (making wed = 0)
            let d2_useage = new Date(d2.getFullYear(), d2.getMonth(), 1); // holiday that has been wednesday shifted
            d2_useage.setDate(d2.getDate() - dow_d2); // modify holiday for wednesdays

            let weeks = Math.abs((d1_useage.getTime() - d2_useage.getTime()) / 3600000 / 24 / 7); // how many weeks
            
            if (weeks < .3) //for when it is the week before and set to .142
                weeks = 0;

            weeks = Math.round(weeks);

            if (DOWChosen == "04")
            {
                var wednesdayoverlay = "Wednesday_Plural.png"; //gets the wednesday portion
                if (weeks == 1)
                    wednesdayoverlay = "Wednesday_Single.png"; //one week means single info

                if (d2 < d1)
                {
                    wednesdayoverlay = "sinces";
                    if (weeks == 1)
                        wednesdayoverlay = "since";
                }

                var templocal = babadata.datalocation + "FrogHolidays/"; //creates the output frog image

                var outputname = "outputfrog_" + i + ".png"; //default output name
                if (d1.getTime() - d2.getTime() == 0)
                {
                    outputname =  holidayinfo.name + ".png"; //if today is the event, show something cool

                    var custom = false;
                    if (holidayinfo.name == "date")
                        custom = true;
                    else
                    {
                        try
                        {
                            fs.accessSync(templocal + outputname, fs.constants.R_OK | fs.constants.W_OK);
                        } 
                        catch (err)
                        {
                            custom = true;
                            outputname = "date.png";
                        }
                    }

                    if (custom)
                    {
                        // images(templocal + outputname).save(templocal + "outputfrog_0.png");

                        Jimp.read(templocal + outputname)
                            .then(function (image) {
                                loadedImage = image;
                                return Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
                            })
                            .then(function (font) {
                                loadedImage.print(font, 190, 20, holidayinfo.safename)
                                        .write(templocal + "outputfrog_0.png");
                            })
                            .catch(function (err) {
                                console.error(err);
                            });
                        outputname = "outputfrog_0.png";
                    }
                }
                else
                {
                    weeks = Math.floor(weeks);
                    if (weeks > 999999) weeks = 1000000;
                    var base = holidayinfo.name + "_base.png";

                    try 
                    {
                        await MakeImage(templocal, base, wednesdayoverlay, weeks, outputname, holidayinfo, false);
                    }
                    catch(err) // probably not nessisary
                    {
                        await MakeImage(templocal, "date_base.png", wednesdayoverlay, weeks, outputname, holidayinfo, true);
                    }
                    
                }
                
                var tempFilePath = templocal + outputname; // temp file location
                templocationslist.push(tempFilePath);
            }
        }
        
        for (var j = 0; j < templocationslist.length; j++)
        {
            var newAttch = new Discord.AttachmentBuilder(templocationslist[j], 
                { name: IsHoliday[j].name + '.png', description : "It is " + IsHoliday[j].name + ", my dudes"}); //makes a new discord attachment
            try
            {
                fs.accessSync(templocationslist[j], fs.constants.R_OK | fs.constants.W_OK);
            } 
            catch (err)
            {
                var newAttch = new Discord.AttachmentBuilder(templocal + "error.png", 
                    { name: 'error.png', description : "It is error time, my dudes! Brug why you erroring baba?"}); //makes a new discord attachment (default fail image)
            }
            
            var op = { content: "It is Wednesday, My BABAs", files: [newAttch] }
            outs.push(op);
        }
    }
    else
    {
        if ((d1.getDay() == 3 && (mode == "00" || mode == "04")))
            outs.push({ content: "It is Wednesday, My Dudes" });
        else
        {
            if (msgContent.replace("wednesday", "").replace("when is", "").replace("day of week", "").replace("days until", "").trim() == "next")
                outs.push({ content: "The definition of insanity is doing the same thing over and over expecting a different result" });
            else
                outs.push({ content: "FUNNYDOW" });
        }
    }

    if (outs.length == 0)
        outs.push({ content: "Baba Broke Getting that Event!" });
    
    return outs;
}

/**
 * Looks up user's real name or nickname from database
 *
 * Queries database via NameFromUser to get stored display name for Discord user.
 * Used to retrieve preferred names or real names associated with user IDs.
 *
 * @param {Object} user - Discord user object with id and username properties
 * @returns {string} Message indicating user's name or error if not found
 */
async function babaWhomst(user)
{
    var result = await NameFromUser(user);

    if (result == null)
        return "Baba could not find that user!";

    // do formatting on result
    if (result.length == 0)
    {
        console.log(`Whomst lookup for id ${user.id} (${user.username}) returned no results`)
        return  `User ${user.username} not found!`;
    }
    else
    {
        return `User ${user.username} is ${result}`;
    }
}

/**
 * Fetches hurricane tracking image from NOAA with name-based lookup
 *
 * External API call to https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png (default)
 * or specific hurricane image if name provided. Downloads image to temp directory
 * via HTTPS stream and returns via callback.
 *
 * Hurricane lookup process:
 * - Searches checkHurricaneStuff for exact name match or letter match
 * - Checks hurricane.json database for cached entries
 * - If name provided, retrieves specific hurricane image URL
 * - Falls back to Atlantic basin overview if no name match
 *
 * Hurricane info includes:
 * - Category (Cat 1-5 or N/A)
 * - Type (Tropical Storm, Hurricane, Depression)
 * - Name (official designation)
 * - Override text for fuzzy matches or numbered searches
 *
 * @param {string} hurricanename - Name of hurricane to look up, or empty for all
 * @param {Function} callback - Called with Discord message object after download completes
 */
async function babaHurricane(hurricanename, callback)
{
    var tempFilePath = babadata.temp + "hurricane.png";
    const file = fs.createWriteStream(tempFilePath);
    var url = "https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png";

    var binus = "";

    console.log("Hurricane lookup for " + hurricanename);

    // check the hurricane.json for exisiting name or subname classification:
        // if name, use the the link saved  -DONE
        // else if name starts with existing letter, provide the link to corresponding letter  -DONE
        // else look up on the site starting with the number indexed letter
            // if letter is not a-z skip
            // if letter pulls a blank folder, skip (as may be something far down alphabet)
            // XX if letter (to number) pulls a folder with files (check for xml file)
                // if xml file exists, get name and check if in db and matches
                    // if not in db, add to db with name of hurricane and link to image
                    // check if name matches now or subname, or subletter
                        // if so, we got em boys, use image in db
                    // if name doesnt match, check next index and repeat starting at XX
                // if xml file does not exist, stop searching as empty folder means end of line

    // {"name": "bikus", "letter": "B", "url": "bikus.png"}
    var hfull = undefined;
    if (hurricanename != "" && hurricanename != null)
    {
        var hurricaneInfo = await checkHurricaneStuff(hurricanename);

        if (hurricaneInfo != null)
        {
            hfull = " for " + (hurricaneInfo.Category == "N/A" ? hurricaneInfo.Type : hurricaneInfo.Category + " " + hurricaneInfo.Type) + " " + hurricaneInfo.Name;

            if (hurricaneInfo.OverideText != null)
            {
                if ("AltName" in hurricaneInfo.OverideText)
                    hfull += " (Closest Match to " + hurricaneInfo.OverideText.AltName + ")";
                else if ("NumberSearch" in hurricaneInfo.OverideText)
                    hfull += " (Hurricane Numbered: " + hurricaneInfo.OverideText.NumberSearch + ")";
            }

            url = hurricaneInfo.ImageURL;

            binus = hfull;
        }
    }

    console.log(url);

    const request = https.get(url, function(response) {
       response.pipe(file);

       // after download completed close filestream
        file.on("finish", () => {
            file.close();
            console.log("Download Completed for " + hurricanename);

            var vv = hfull === undefined ? " for all Hurricanes" : hfull;

            var newAttch = new Discord.AttachmentBuilder(tempFilePath,
                { name: vv + '.png', description : "Hurricane Info" + vv}); //makes a new discord attachment

           callback({ content: "Baba Hurricane Info" + binus, files: [newAttch] });
        });
    });
}

/**
 * Fetches AI-generated cat image from thiscatdoesnotexist.com
 *
 * External API call to https://thiscatdoesnotexist.com/ which serves
 * GAN-generated cat images. Downloads image to temp directory via HTTPS
 * stream and returns via callback.
 *
 * Note: Reuses hurricane.png filename in temp directory
 *
 * @param {Function} callback - Called with Discord message object after download completes
 */
function babaCat(callback)
{
    var tempFilePath = babadata.temp + "hurricane.png";
    const file = fs.createWriteStream(tempFilePath);
    var url = "https://thiscatdoesnotexist.com/";

    console.log(url);

    const request = https.get(url, function(response) {
       response.pipe(file);

       // after download completed close filestream
       file.on("finish", () => {
           file.close();
           console.log("Download Completed for Cat");

           callback({ content: "Baba Cat", files: [tempFilePath] });
       });
    });
}

/**
 * Fetches weather forecast image from wttr.in API for specified city
 *
 * External API call to https://wttr.in/ or https://v2.wttr.in/ depending on mode.
 * Downloads weather PNG image to temp directory and returns via callback.
 * Includes error handling for failed requests.
 *
 * Modes:
 * - "four": Standard 4-day forecast from wttr.in (default)
 * - "deets": Detailed forecast from v2.wttr.in with more metrics
 *
 * URL encoding: Replaces spaces in city name with %20 for proper API format.
 * Units: Always uses imperial units (?u parameter)
 *
 * @param {string} mode - Weather display mode: "four" or "deets"
 * @param {string} city - City name for weather lookup (spaces allowed)
 * @param {Function} callback - Called with Discord message object or error after download
 */
function babaWeather(mode, city, callback)
{
    //TODO: add check if site down
    var tempFilePath = babadata.temp + "weather.png";
    const file = fs.createWriteStream(tempFilePath);
    var cityUnderscore = city.replace(" ", "%20");
    var url = "https://wttr.in/" + cityUnderscore + ".png?u";

    if (mode == "four")
        url = "https://wttr.in/" + cityUnderscore + ".png?u";
    else if (mode == "deets")
        url = "https://v2.wttr.in/" + cityUnderscore + ".png?u";

    console.log(url);

    const request = https.get(url, function(response) {
       response.pipe(file);

       // after download completed close filestream
       file.on("finish", () => {
           file.close();
           console.log("Download Completed for Weather");

           var newAttch = new Discord.AttachmentBuilder(tempFilePath,
               { name: city + '.png', description : "Weather info for " + city}); //makes a new discord attachment

           callback({ content: "Baba Weather", files: [newAttch] });
        }).on('error', () => {
            callback({ content: "Baba Weather Error" });
        });
    });
}

/**
 * Schedules reminder message to be sent at specified time/date
 *
 * Parses time string (e.g., "3:30pm") and optional date to calculate delay.
 * If time has passed today and no date given, schedules for tomorrow.
 * Creates scheduled reminder via reverseDelay system.
 *
 * Time calculation steps:
 * 1. Parse time string to Date object (today at that time)
 * 2. Parse optional date string to get target date
 * 3. Combine date + time or default to today/tomorrow
 * 4. Calculate milliseconds from now
 * 5. Schedule via reverseDelay
 *
 * @param {string} message - Reminder message content to send later
 * @param {string} time - Time string (e.g., "3:30pm", "14:30")
 * @param {string} [date] - Optional date string for future dates
 * @param {Object} interaction - Discord interaction object with guild and channel info
 * @returns {Date} Scheduled reminder date/time
 */
async function babaRemind(message, time, date, interaction)
{
    var theTime = getTimeFromString(time); // returns Date object for today at that time
    var now = getD1(true); // now in correct timezone
    var theDate = null;

    if (date != null)
    {
        var parsedDate = FindDate(date);
        theDate = new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day);
        // Set the time part
        theDate.setHours(theTime.getHours(), theTime.getMinutes(), theTime.getSeconds(), theTime.getMilliseconds());
    }
    else
    {
        // No date provided — use today's time, but if it's already passed, use tomorrow
        if (theTime.getTime() <= now.getTime())
        {
            theTime.setDate(theTime.getDate() + 1); // move to tomorrow
        }
        theDate = theTime;
    }

    var newTimeFromNow = theDate.getTime() - now.getTime();

    var fullmsg = message;

    // obtain channel
    var channel = await interaction.guild.channels.fetch(interaction.channelId);

    await reverseDelay(null, interaction.member.id, channel, fullmsg, newTimeFromNow, true);

    return theDate;
}

/**
 * Fetches aurora borealis forecast image from NOAA Space Weather Prediction Center
 *
 * External API call to https://services.swpc.noaa.gov/experimental/images/aurora_dashboard/
 * Downloads aurora forecast PNG showing predicted visibility viewline for specified time.
 * Returns via callback after download completes.
 *
 * Time parameter determines forecast period (e.g., "now", "30min", "60min").
 * Shows geographic viewline of where aurora may be visible.
 *
 * @param {string} time - Forecast time period identifier
 * @param {Function} callback - Called with Discord message object after download completes
 */
function babaAurora(time, callback)
{
    var url = "https://services.swpc.noaa.gov/experimental/images/aurora_dashboard/" + time + "_static_viewline_forecast.png"
    var tempFilePath = babadata.temp + "aurora.png";
    const file = fs.createWriteStream(tempFilePath);

    const request = https.get(url, function(response) {
        response.pipe(file);

        // after download completed close filestream
         file.on("finish", () => {
             file.close();
             console.log("Download Completed for Aurora");

             var vv = "Aurora Forecast for " + time;

             var newAttch = new Discord.AttachmentBuilder(tempFilePath,
                 { name: vv + '.png', description : "Aurora Info" + vv}); //makes a new discord attachment

            callback({ content: "Baba Aurora Info", files: [newAttch] });
         });
     });
}

/**
 * Fetches Goodberry's flavor calendar events from public Google Calendar
 *
 * External API call via PublicGoogleCalendar library to retrieve calendar events.
 * Calendar ID: 24gbb7942jsn557e7l93in7itjmo5lqj@import.calendar.google.com
 *
 * Used to display Goodberry's frozen custard flavor schedule. Returns raw events
 * array via callback for further processing/display.
 *
 * @param {Function} callback - Called with object containing events array, or error logged
 */
function babaGoodberrys(callback)
{
    publicGoogleCalendar = new PublicGoogleCalendar({ calendarId: '24gbb7942jsn557e7l93in7itjmo5lqj@import.calendar.google.com' });

    publicGoogleCalendar.getEvents(function(err, events)
    {
        if (err) { return console.log(err.message); }
        return callback({ events: events});
    });
}

module.exports = {
    babaFriday, 
    babaHelp, 
    babaPlease, 
    babaPizza, 
    babaVibeFlag, 
    babaYugo, 
    babaHaikuEmbed,
    babaHaikuLinks,
    babaUntilHolidays,
    babaDayNextWed,
    babaRepost,
    babaProgress,
    babaJeremy,
    babaRNG,
    babaWhomst,
    babaHurricane,
    babaCat,
    babaWeather,
    babaRemind,
    babaAurora,
    babaGoodberrys
};