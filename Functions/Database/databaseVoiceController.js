var babadata = require('../../babotdata.json'); //baba configuration file

const fs = require('fs');
var mysql = require('mysql2');

const { getD1 } = require('../../Tools/overrides');

// MySQL connection instance (null when disconnected)
var con;

// Timeout handle for auto-disconnect after 60s of inactivity
var timeoutDisconnect = null;

// Timeout handle for database reconnection retry attempts
var timeoutFix = null;

// Timeout handle for clearing voice channel change list after DB restore
var timeoutClear = null;

// Error counter for connection failures - triggers retry mode when >1
// Resets to 0 when connection is stable again
var timeoutCT = 0;


// Connection Management Strategy:
// - Connects on SQL query, auto-disconnects after 60 seconds of inactivity
// - On failure: retry every 60 seconds until connection restores
// - On restore: confirm stability with 3 ping attempts, then replay queued voice changes


// ============================================
// Helper Functions
// ============================================

/**
 * Splits string into chunks at space boundaries for Discord message limits
 *
 * Discord has a 2000 character limit per message. This function splits long
 * strings at word boundaries to ensure each chunk is ≤1900 characters (leaving
 * room for embeds/formatting).
 *
 * @param {string} str - Input string to split
 * @returns {string[]} Array of strings, each ≤1900 characters
 */
function splitStringInto1900CharChunksonSpace(str)
{
	var chunks = [];
	var chunk = "";
	var lines = str.split(" ");
	for (var i = 0; i < lines.length; i++)
	{
		if (chunk.length + lines[i].length > 1900)
		{
			chunks.push(chunk);
			chunk = "";
		}
		chunk += lines[i] + "\n";
	}
	chunks.push(chunk);
	return chunks;
}

// ============================================
// Database Connection Management
// ============================================

/**
 * Pings the MySQL connection to verify it's alive
 *
 * Tests the existing connection health. If connection fails or is null,
 * returns appropriate status code.
 *
 * @returns {Promise<string>} Resolves with "true" if connected, "false" if null, "ERROR" on failure
 */
function pingConnection()
{
    var PromisedPing = new Promise((resolve, reject) =>
    {
        if (con != null)
        {
            // check if connection is alive
            con.ping(function (err)
            {
                if (err) 
                {
                    console.log("Connection is not alive", false, true);
                    resolve("ERROR");
                    con = null;
                }
                else
                {
                    // console.log("Connection is alive", false, true);
                    resolve("true");
                }
            });
        }
        else
        {
            console.log("Connection is null", false, true);
            resolve("false");
        }
    });

    return PromisedPing;
}

/**
 * Retrieves database connection, creating new one if needed
 *
 * Implements auto-disconnect after 60 seconds of inactivity to prevent connection
 * pool exhaustion. Pings existing connection to verify it's alive before returning.
 * Creates new MySQL connection if current one is dead or null.
 *
 * Side effects:
 * - Sets global timeout for auto-disconnect
 * - May create new MySQL connection
 * - Clears existing disconnect timeout
 *
 * @returns {Promise<mysql.Connection>} Active MySQL connection with UTF8MB4 charset
 */
async function getConnection()
{
    var pingged = await pingConnection();

    if (pingged != "true")
    {
        console.log("Creating New Connection", false, true);
        con = mysql.createConnection({
            host: babadata.database.host,
            user: babadata.database.user,
            password: babadata.database.password,
            database: babadata.database.database,
            port: babadata.database.port,
            charset : 'utf8mb4_general_ci' // UTF8MB4 supports all Unicode characters including emojis
        });
    }

    // Clear any existing disconnect timeout
    if (timeoutDisconnect != null)
    {
        clearTimeout(timeoutDisconnect);
        timeoutDisconnect = null;
    }

    // Auto-disconnect after 60 seconds of inactivity to prevent connection pool exhaustion
    timeoutDisconnect = setTimeout(function()
    {
        if (con != null)
        {
            try 
            {
                con.end(function(err) 
                {
                    if (err) 
                    {
                        console.log("Error Ending Connection: " + err, false, true);
                        DMMePlease("Error Ending Connection: " + err, false, true);
                    }

                    console.log("Connection Ended", false, true);
                    con = null;
                });
    
                timeoutCT = 0;
                con = null;
            }
            catch (err)
            {
                console.log("Error Ending Connection: " + err, false, true);
                DMMePlease("Error Ending Connection: " + err, false, true);
                con = null;
            }
        }
    }, 60000);

    return con;
}

/**
 * Handles database connection errors with progressive retry logic
 *
 * Implements sophisticated retry mechanism:
 * - First 2 errors: Just log and increment counter
 * - Subsequent errors: Disable DB access flag, start 60-second retry cycle
 * - On restore: Performs 3 confirmation pings at 10-second intervals
 * - If stable: Restores user voice data
 * - If unstable: Returns to retry mode
 *
 * Side effects:
 * - Modifies global.dbAccess[1] flag
 * - Sets multiple timers (timeoutFix, timeoutDisconnect, timeoutClear)
 * - Increments timeoutCT counter
 * - May trigger clearVCCList() to restore voice data
 */
function dbErrored()
{
    timeoutCT++;
    console.log("Database Connection Failed -> " + timeoutCT, false, true);

    // Only enter retry mode after 2 failures to avoid false positives from transient errors
    if (timeoutCT > 1)
    {
        // Disable database access flag to prevent new queries during reconnection
        global.dbAccess[1] = false;

        // Clear all existing timers to prevent conflicts with new retry cycle
        if (timeoutFix != null)
        {
            clearTimeout(timeoutFix);
            timeoutFix = null;
        }

        if (timeoutDisconnect != null)
        {
            clearTimeout(timeoutDisconnect);
            timeoutDisconnect = null;
        }

        if (timeoutClear != null)
        {
            clearTimeout(timeoutClear);
            timeoutClear = null;
        }

        // Begin 60-second retry cycle
        timeoutFix = setTimeout(async function()
        {
            var pingged = await pingConnection();
            if (pingged == "ERROR")
            {
                var timestring = getD1(true).toLocaleTimeString();
                timeoutCT++;
                console.log(timestring + ": Database Connection Failed, Retrying in 60 seconds -> " + timeoutCT, false, true);
                timeoutFix = setTimeout(arguments.callee, 60000);
            }
            else if (pingged == "false")
            {
                // Try to reconnect to the DB
                await getConnection();
                if (timeoutDisconnect != null) 
                {
                    clearTimeout(timeoutDisconnect);
                    timeoutDisconnect = null;
                }
                
                var timestring = getD1(true).toLocaleTimeString();
                timeoutCT++;
                console.log(timestring + ": Database Connection was null, attempted reconnect, Retrying in 60 seconds -> " + timeoutCT, false, true);
                timeoutFix = setTimeout(arguments.callee, 60000);
            }
            else
            {
                console.log("Database Connection Possibly Restored", false, true);

                // Stability confirmation: Ping 3 times at 10-second intervals to ensure connection is stable
                // Prevents premature restoration that could corrupt voice activity logs
                let confirmAttempts = 0;
                let confirmFailures = 0;
                const confirmDbRestore = async () =>
                {
                    let pingged = await pingConnection();
                    if (pingged !== "true")
                    {
                        confirmFailures++;
                    }
                    console.log("Confirming DB Restore: Attempt " + (confirmAttempts + 1) + " - Ping Result: " + pingged, false, true);

                    confirmAttempts++;
                    if (confirmAttempts < 3)
                    {
                        // Schedule next confirmation attempt in 10 seconds
                        setTimeout(confirmDbRestore, 10000);
                    }
                    else
                    {
                        // All 3 confirmation attempts complete - evaluate results
                        if (confirmFailures > 0)
                        {
                            // Connection still unstable - return to 60-second retry cycle
                            console.log("DB unstable after restore, reverting to retry mode", false, true);
                            timeoutFix = setTimeout(arguments.callee, 60000);
                        }
                        else
                        {
                            // Connection confirmed stable - restore normal operations
                            global.dbAccess[1] = true;
                            timeoutCT = 0;
                            clearTimeout(timeoutFix);
                            timeoutFix = null;

                            // Replay voice activity changes that were queued in CSV during downtime
                            console.log("Restoring User Voice Data in 10 seconds", false, true);
                            timeoutClear = setTimeout(function()
                            {
                                console.log("Restoring User Voice Data", false, true);
                                clearVCCList(); // Processes loggedUsersVCC.csv
                            }, 10000);
                        }
                    }
                };
                // Begin first confirmation attempt in 10 seconds
                setTimeout(confirmDbRestore, 10000);
            }
        }, 60000);
    }
}

/**
 * Executes SQL query with connection management and error handling
 *
 * Obtains active connection, checks global DB access flags, executes query,
 * and handles errors via ErrorWithDB(). Resets timeout counter on success.
 *
 * @param {string} query - SQL query string to execute
 * @returns {Promise<Object[]>} Query result set
 * @throws {Error} If database not accessible or query fails
 */
async function callSQLQuery(query)
{
    var condor = await getConnection();
    return new Promise((resolve, reject) =>
    {
        // Dual flag check: dbAccess[0] = allowDB from config, dbAccess[1] = connection health status
        // Both must be true for queries to execute - allows manual DB disable and automatic failure handling
        if ((global.dbAccess[1] && global.dbAccess[0]))
        {
            condor.query(query, function (err, result)
            {
                if (err)
                {
                    ErrorWithDB(err, query);
                    reject(err);
                }
                else
                {
                    // Successful query - ensure health flag is true
                    global.dbAccess[1] = true;

                    // Reset error counter on first successful query after failures
                    if (timeoutCT > 0)
                    {
                        timeoutCT = 0;
                        console.log("Timeout CT Reset", false, true);
                    }
                    resolve(result);
                }
            });
        }
        else
        {
            // Silent failure mode - queries fail gracefully when DB is disabled or unhealthy
            // Prevents cascade of error messages during downtime
            console.log("Query did not Run:", false, true);
            console.log(query, false, true);
            console.log("Database Not Accessible", false, true);
            reject("Database Not Accessible");
        }
    });
}

/**
 * Handles database errors by logging query and error details
 *
 * Logs error to console and DMs admin via DMMePlease. Splits long queries into
 * chunks for Discord message limits. Triggers dbErrored() retry logic.
 *
 * Side effects:
 * - Sends DM notifications to admin thread
 * - Calls dbErrored() to initiate retry mechanism
 *
 * @param {Error} err - The error object from MySQL
 * @param {string} query - The SQL query that caused the error
 */
function ErrorWithDB(err, query)
{
    console.log("Error Occured because of Query: ", false, true);
    console.log(query, false, true);

    DMMePlease("Error Occured because of Query: ");
    var qChunks = splitStringInto1900CharChunksonSpace(query);
    for (var i = 0; i < qChunks.length; i++)
    {
        DMMePlease("```\n"  + qChunks[i] + "\n```", false);
    }

    DMMePlease("Error: \n```\n" + err + "\n```", false);

    dbErrored();
}

/**
 * Sends debug/error messages to admin log thread in Discord
 *
 * Posts message to configured log thread channel for monitoring and debugging.
 * Uses different guild/channel IDs based on testing flag in babotdata.json.
 *
 * Side effects:
 * - Posts message to Discord thread
 * - May log to console if consoledlog is true
 *
 * @param {string} sourceMessage - Message to send to admin log
 * @param {boolean} [consoledlog=true] - Whether to also log to console
 */
function DMMePlease(sourceMessage, consoledlog = true)
{
    if (consoledlog)
        console.log("DMMePlease: " + sourceMessage, false, true);

    var guildID = babadata.testing === undefined ? "454457880825823252" : "522136584649310208";
    var logThreadChanID = babadata.testing === undefined ? "1337944450084769876" : "1337943563996106915";
    var channelOfThread = babadata.testing === undefined ? "509401300874690590" : "757071872721682594";

    global.Bot.guilds.fetch(guildID).then(async guild =>
    {
        guild.channels.fetch(channelOfThread).then(channel => 
        {
            channel.threads.fetch(logThreadChanID).then(thread =>
            {
                thread.send(sourceMessage);
            })
        })
        .catch(console.error);
    }).catch(console.error);
}

/**
 * Sends file data to admin log thread as JSON attachment
 *
 * Converts JavaScript object to formatted JSON and posts as file attachment
 * to admin log thread for debugging/inspection.
 *
 * Side effects:
 * - Posts file attachment to Discord thread
 *
 * @param {string} filename - Name for the attached file
 * @param {Object} filedata - JavaScript object to serialize as JSON
 * @param {string} description - Message content accompanying the file
 */
function DMMEAFile(filename, filedata, description)
{
    var guildID = babadata.testing === undefined ? "454457880825823252" : "522136584649310208";
    var logThreadChanID = babadata.testing === undefined ? "1337944450084769876" : "1337943563996106915";
    var channelOfThread = babadata.testing === undefined ? "509401300874690590" : "757071872721682594";

    global.Bot.guilds.fetch(guildID).then(async guild =>
    {
        guild.channels.fetch(channelOfThread).then(channel => 
        {
            channel.threads.fetch(logThreadChanID).then(thread =>
            {
                thread.send({ files: [{ attachment: Buffer.from(JSON.stringify(filedata, null, 2)), name: filename }] , content: description});
            })
        })
        .catch(console.error);
    }).catch(console.error);
}

// ============================================
// User Name Lookup Functions
// ============================================

/**
 * Retrieves username from user ID via cache
 *
 * Checks global userCache first. If not found, loads user values from database
 * cache and retries. Used for displaying usernames in logs and messages.
 *
 * @param {string} userID - Discord user ID
 * @returns {Promise<string>} Username from cache
 * @throws {string} "NameFromUserID" if user not found after cache load
 */
function NameFromUserIDID(userID)
{
    var PromisedName = new Promise((resolve, reject) =>
    {
        if (global.userCache[userID] != null)
        {
            // console.log("NameFromUserID Cache Hit", false, true);
            resolve(global.userCache[userID]);
        }
        else
        {
            // call LoadUserValuesCache
            LoadUserValuesCache().then(() =>
            {
                if (global.userCache[userID] != null)
                {
                    resolve(global.userCache[userID]);
                }
                else
                {
                    reject("NameFromUserID");
                }
            }).catch((err) => {reject("NameFromUserID")});
        }
    });

    return PromisedName;
}

// ============================================
// Discord Event Database Functions
// ============================================

/**
 * Syncs Discord scheduled events to database
 *
 * Handles create, update, delete, useradd, and userremove event changes.
 * Stores event metadata (name, description, times, status, location) and tracks
 * user participation including join/leave patterns and "flaking" behavior.
 *
 * Event statuses: 1=SCHEDULED, 2=ACTIVE, 3=COMPLETED, 4=CANCELED
 *
 * Side effects:
 * - Inserts/updates records in scheduleevent table
 * - Tracks user joins/leaves in eventpurity table
 *
 * @param {Discord.GuildScheduledEvent} event - Discord event object
 * @param {string} change - Type of change: "create", "update", "delete", "useradd", "userremove"
 * @param {Discord.User} [user] - User object (for useradd/userremove changes)
 */
function EventDB(event, change, user)
{
	var eid = event.id;
    // Branch 1: Event metadata changes (create/update/delete)
    if (!change.includes("user"))
    {
        var cid = event.creatorId;
        var chanid = event.channelId;
        var name = event.name;
        var desc = event.description;
        var d1 = new Date(event.scheduledStartTimestamp);
        var d2 = new Date(event.scheduledEndTimestamp);

        // Convert Discord's numeric status codes to readable strings
        var status = event.status;
        switch (status)
        {
            case 1:
                status = "SCHEDULED"; // Event created, not started
                break;
            case 2:
                status = "ACTIVE"; // Event currently running
                break;
            case 3:
                status = "COMPLETED"; // Event finished normally
                break;
            case 4:
                status = "CANCELED"; // Event deleted before completion
                break;
        }

        var loc = "Voice Channel";

        // Zero-pad single-digit months and days for MySQL DATETIME format: YYYY-MM-DD HH:MM:SS
        var mpre1 = d1.getMonth() + 1 < 10 ? 0 : "";
        var dpre1 = d1.getUTCDate() < 10 ? 0 : "";
        var mpre2 = d2.getMonth() + 1 < 10 ? 0 : "";
        var dpre2 = d2.getUTCDate() < 10 ? 0 : "";

        var start = `${d1.getFullYear()}-${mpre1}${d1.getMonth() + 1}-${dpre1}${d1.getUTCDate()} ${d1.getHours()}:${d1.getMinutes()}:${d1.getSeconds()}`
        var end = `${d2.getFullYear()}-${mpre2}${d2.getMonth() + 1}-${dpre2}${d2.getUTCDate()} ${d2.getHours()}:${d2.getMinutes()}:${d2.getSeconds()}`

        // Extract location from metadata for external events (not voice channels)
        if (event.entityMetadata != null)
        {
            loc = event.entityMetadata.location;
        }

        if (change == "create")
        {
            var qurey = `INSERT INTO scheduleevent (eventID, creatorID, name, channelID, description, StartTime, EndTime, status, Location) VALUES ("${eid}", "${cid}", "${name}", "${chanid}", "${desc}", "${start}", "${end}", "${status}", "${loc}")`;
            callSQLQuery(qurey)
            .then((result) => {})
            .catch((err) => {DMMePlease("Error Creating Event: " + err)});
        }
        else if (change == "delete")
        {
            var qurey = `UPDATE scheduleevent Set status = "CANCELED" WHERE eventID = "${eid}"`;
            callSQLQuery(qurey)
            .then((result) => {})
            .catch((err) => {DMMePlease("Error Deleting Event: " + err)});
        }
        else if (change == "update")
        {
            var qurey = `UPDATE scheduleevent Set creatorID = "${cid}", name = "${name}", channelID = "${chanid}", description = "${desc}", StartTime = "${start}", EndTime = "${end}", status = "${status}", Location = "${loc}" WHERE eventID = "${eid}"`;
            callSQLQuery(qurey)
            .then((result) => {})
            .catch((err) => {DMMePlease("Error Updating Event: " + err)});
        }
    }
    // Branch 2: User participation tracking (useradd/userremove)
    else
    {
        var uid = user.id;
        var time = getD1(true);
        var mpre = time.getMonth() + 1 < 10 ? 0 : "";
        var dpre = time.getUTCDate() < 10 ? 0 : "";
        var jtime = `${time.getFullYear()}-${mpre}${time.getMonth() + 1}-${dpre}${time.getUTCDate()} ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`

        if (change == "useradd")
        {
            // User clicked "Interested" - try to update existing record first
            var query = `UPDATE eventpurity SET flaked = 0, timesrejoined = timesrejoined + 1, joined = 1, latestjointime = "${jtime}", flaketime = null WHERE eventID = "${eid}" AND userID = "${uid}"`;
            callSQLQuery(query)
            .then((result) =>
            {
                // If no existing record (affectedRows = 0), create new participation record
                if (result.affectedRows == 0)
                {
                    var innrquery = `INSERT INTO eventpurity (eventID, userID, flaked, timesrejoined, joined, latestjointime, initjointime) VALUES ("${eid}", "${uid}", 0, 1, 1, "${jtime}", "${jtime}")`;
                    callSQLQuery(innrquery)
                    .then((result) => {})
                    .catch((err) => {DMMePlease("Error Adding User to Event: " + err)});
                }
            })
            .catch((err) => {DMMePlease("Error Updating User in Event: " + err)});
        }
        else if (change == "userremove")
        {
            // User removed interest - mark as "flaked" with timestamp
            // Tracks users who repeatedly join/leave events (flaky behavior)
            var query = `UPDATE eventpurity SET flaked = 1, joined = 0, flaketime = "${jtime}", latestjointime = null WHERE eventID = "${eid}" AND userID = "${uid}"`;
            callSQLQuery(query)
            .then((result) => {})
            .catch((err) => {DMMePlease("Error Removing User from Event: " + err)});
        }
    }
}

// ============================================
// User Opt-In/Out Functions
// ============================================

/**
 * Opts user into a feature type (e.g., mentions, notifications)
 *
 * Updates or inserts user preference in opting table. Used for managing
 * user preferences for various bot features.
 *
 * Side effects:
 * - Updates/inserts record in opting table
 *
 * @param {Discord.User} user - Discord user object
 * @param {string} type - Feature type identifier (ItemToRemove column value)
 * @returns {Promise<string>} "OptIn" on success
 * @throws {string} "OptIn" on database error
 */
function optIn(user, type)
{
    var PromisedOptIn = new Promise((resolve, reject) =>
    {
        var query = `UPDATE opting Set Val='in' WHERE DiscordID = "${user.id}" AND ItemToRemove = "${type}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.affectedRows == 0)
            {
                var query = `INSERT INTO opting (DiscordID, ItemToRemove, Val) VALUES ("${user.id}", "${type}", "in")`;
                callSQLQuery(query)
                .then((result) => {resolve("OptIn")})
                .catch((err) => {reject("OptIn")});
            }
            else
            {
                resolve("OptIn");
            }
        })
        .catch((err) => {reject("OptIn")});
    });

    return PromisedOptIn;
}

/**
 * Opts user out of a feature type
 *
 * Updates or inserts user preference to "out" in opting table.
 *
 * Side effects:
 * - Updates/inserts record in opting table
 *
 * @param {Discord.User} user - Discord user object
 * @param {string} type - Feature type identifier
 * @returns {Promise<string>} "OptOut" on success
 * @throws {string} "OptOut" on database error
 */
function optOut(user, type)
{
    var PromisedOptOut = new Promise((resolve, reject) =>
    {
        var query = `UPDATE opting Set Val='out' WHERE DiscordID = "${user.id}" AND ItemToRemove = "${type}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.affectedRows == 0)
            {
                var query = `INSERT INTO opting (DiscordID, ItemToRemove, Val) VALUES ("${user.id}", "${type}", "out")`;
                callSQLQuery(query)
                .then((result) => {resolve("OptOut")})
                .catch((err) => {reject("OptOut")});
            }
            else
            {
                resolve("OptOut");
            }
        })
        .catch((err) => {reject("OptOut")});
    });

    return PromisedOptOut;
}

// ============================================
// Voice Channel Tracking Functions
// ============================================

/**
 * Ensures user exists in database, creating if necessary
 *
 * Checks userval table for user record. If not found, inserts new record.
 * Used before logging voice channel activity to ensure foreign key constraints.
 *
 * Side effects:
 * - May insert new user record in userval table
 *
 * @param {string} userID - Discord user ID
 * @param {string} userName - Username to store
 * @returns {Promise<string>} "User Created" or "User Exists"
 * @throws {string} "CreateUser" on database error
 */
function CheckAndCreateUser(userID, userName)
{
    var PromisedUser = new Promise((resolve, reject) =>
    {
        var query = `Select * from userval where DiscordID = "${userID}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.length == 0)
            {
                var query = `INSERT INTO userval (DiscordID, PersonName) VALUES ("${userID}", "${userName}")`;
                callSQLQuery(query)
                .then((result) => {resolve("User Created")})
                .catch((err) => {reject("CreateUser")});
            }
            else
            {
                resolve("User Exists");
            }
        })
        .catch((err) => {reject("CreateUser")});
    });

    return PromisedUser;
}

/**
 * Ensures voice channel exists in database, creating if necessary
 *
 * Checks channelval table for channel record. If not found, inserts new record
 * with type "Voice". Used before logging voice activity.
 *
 * Side effects:
 * - May insert new channel record in channelval table
 *
 * @param {string} channelID - Discord channel ID
 * @param {string} channelName - Channel name to store
 * @returns {Promise<string>} "Channel Created" or "Channel Exists"
 * @throws {string} "CreateChannel" on database error
 */
function checkAndCreateChannel(channelID, channelName)
{
    var PromisedChannel = new Promise((resolve, reject) =>
    {
        var query = `Select * from channelval where ChannelID = "${channelID}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.length == 0)
            {
                var query = `INSERT INTO channelval (ChannelID, ChannelName, Type) VALUES ("${channelID}", "${channelName}", "Voice")`;
                callSQLQuery(query)
                .then((result) => {resolve("Channel Created")})
                .catch((err) => {reject("CreateChannel")});
            }
            else
            {
                resolve("Channel Exists");
            }
        })
        .catch((err) => {reject("CreateChannel")});
    });

    return PromisedChannel;
}

/**
 * Executes voice activity query with automatic user/channel creation fallback
 *
 * Attempts to insert/update voice activity record. If foreign key constraint fails
 * (user or channel doesn't exist), automatically creates missing records and retries.
 * This handles race conditions where users join channels before being cached.
 *
 * Side effects:
 * - Executes voice activity query
 * - May create user and/or channel records
 * - Retries query after creating missing records
 *
 * @param {string} queryz - SQL query to execute
 * @param {string} userID - Discord user ID
 * @param {string} channelID - Discord channel ID
 * @param {Discord.Guild} guild - Discord guild object for fetching channel/member data
 * @param {string} subtext - Description of action ("Joined" or "Left")
 * @returns {Promise<string>} The executed query string
 * @throws {string} "UserVoiceChange" on database error
 */
function userVoiceChange(queryz, userID, channelID, guild, subtext)
{
    var PromisedVoiceChange = new Promise((resolve, reject) =>
    {
        var query = queryz;
        callSQLQuery(query)
        .then((result) =>
        {
            resolve(queryz);
        })
        .catch((err) =>
        {
            // Foreign key error handling: voiceactivity table has foreign keys to channels and users tables
            // If query fails due to missing channel/user record, create it and retry

            // voiceactivity_ibfk_1 = Foreign key constraint on ChannelID
            if (err != null && err.sqlMessage != null && err.sqlMessage.includes("voiceactivity_ibfk_1"))
            {
                console.log("Error: " + err.sqlMessage, false, true);
                // Channel doesn't exist in database - fetch from Discord and create record
                guild.channels.fetch(channelID)
                .then(channel =>
                {
                    checkAndCreateChannel(channelID, channel.name).then(() =>
                    {
                        // Retry original query after creating channel record
                        userVoiceChange(queryz, userID, channelID, guild, subtext).then((result) => {resolve(result)}).catch((err) => {reject(err)});
                    })
                    .catch((err) => {reject("CreateChannel")});
                })
                .catch(console.error);
            }
            // voiceactivity_ibfk_2 = Foreign key constraint on UserID
            else if (err != null && err.sqlMessage != null && err.sqlMessage.includes("voiceactivity_ibfk_2"))
            {
                console.log("Error: " + err.sqlMessage, false, true);
                // User doesn't exist in database - fetch from Discord and create record
                guild.members.fetch(userID)
                .then(user =>
                {
                    CheckAndCreateUser(userID, user.user.username).then(() =>
                    {
                        // Retry original query after creating user record
                        userVoiceChange(queryz, userID, channelID, guild, subtext).then((result) => {resolve(result)}).catch((err) => {reject(err)});
                    })
                    .catch((err) => {reject("CreateUser")});
                })
                .catch(console.error);
            }
            else
            {
                // Other error types - fail gracefully
                console.log("Error: " + err, false, true);
                reject("UserVoiceChange");
            }
        });
    });

    return PromisedVoiceChange;
}

/**
 * Records user joining a voice channel
 *
 * Inserts StartTime record in voiceactivity table when user enters a voice channel.
 * Uses userVoiceChange for automatic user/channel creation if needed.
 *
 * SQL: INSERT INTO voiceactivity (ChannelID, UserID, StartTime) VALUES (...)
 *
 * Side effects:
 * - Inserts new record in voiceactivity table
 * - May create user/channel records if missing
 *
 * @param {string} userID - Discord user ID
 * @param {string} channelID - Discord voice channel ID
 * @param {Discord.Guild} guild - Discord guild object
 * @param {Date} [overideTime=null] - Optional time override for logging historical data
 * @returns {Promise<string>} The executed query string
 * @throws {string} "JoinVoice" on database error
 */
function userJoinedVoice(userID, channelID, guild, overideTime = null)
{
    var PromisedUserJoined = new Promise((resolve, reject) =>
    {
        var dt = overideTime == null ? getD1(true) : overideTime;
        var dtsrart = dt.toISOString().slice(0, 19).replace('T', ' ');
        var q = `INSERT INTO voiceactivity (ChannelID, UserID, StartTime) VALUES ("${channelID}", "${userID}", "${dtsrart}")`;
        userVoiceChange(q, userID, channelID, guild, "JoinVoice").then((result) => {resolve(result)}).catch((err) => {reject("JoinVoice")});
    });

    return PromisedUserJoined;
}

/**
 * Records user leaving a voice channel
 *
 * Updates EndTime for the most recent voiceactivity record where EndTime is NULL.
 * Completes the duration tracking for a user's voice session.
 *
 * SQL: UPDATE voiceactivity SET EndTime = ... WHERE UserID = ... AND ChannelID = ... AND EndTime IS NULL
 *
 * Side effects:
 * - Updates EndTime in voiceactivity table
 *
 * @param {string} userID - Discord user ID
 * @param {string} channelID - Discord voice channel ID
 * @param {Discord.Guild} guild - Discord guild object
 * @param {Date} [overideTime=null] - Optional time override for logging historical data
 * @returns {Promise<string>} The executed query string
 * @throws {string} "LeaveVoice" on database error
 */
function userLeftVoice(userID, channelID, guild, overideTime = null)
{
    var PromisedUserLeft = new Promise((resolve, reject) =>
    {
        var dt = overideTime == null ? getD1(true) : overideTime;
        var dtsrart = dt.toISOString().slice(0, 19).replace('T', ' ');
        var q = `UPDATE voiceactivity SET EndTime = "${dtsrart}" WHERE UserID = "${userID}" AND ChannelID = "${channelID}" AND EndTime IS NULL`;
        userVoiceChange(q, userID, channelID, guild, "JoinVoice").then((result) => {resolve(result)}).catch((err) => {reject("LeaveVoice")});
    });

    return PromisedUserLeft;
}

/**
 * Logs voice channel change to CSV when database write fails
 *
 * Fallback mechanism that appends voice activity to CSV file when database is
 * unavailable. CSV is later processed by clearVCCList() when DB restores.
 * Time is stored as Unix timestamp (milliseconds).
 *
 * Side effects:
 * - Creates loggedUsersVCC.csv if doesn't exist
 * - Appends CSV line: newMemberID,newChannelID,oldMemberID,oldChannelID,timestamp,guildID
 *
 * @param {string} newMemberID - User ID after change
 * @param {string} newChannelID - Channel ID user joined (null if left all channels)
 * @param {string} oldMemberID - User ID before change
 * @param {string} oldChannelID - Channel ID user left (null if newly joined)
 * @param {string} guildID - Discord guild ID
 * @param {Date} [timeoveride=null] - Optional time override
 */
function logVCC(newMemberID, newChannelID, oldMemberID, oldChannelID, guildID, timeoveride = null)
{
    var time = getD1(true);
	console.log("Logging VCC Data: " + newMemberID + " " + oldMemberID + " " + newChannelID + " " + oldChannelID + " " + time + " " + guildID, false, true);

	// Convert time to Unix timestamp (milliseconds since epoch) for compact storage
	time = time.getTime();

    if (timeoveride != null)
        time = timeoveride.getTime();

	// Create CSV file if it doesn't exist
	if (!fs.existsSync(babadata.datalocation + "loggedUsersVCC.csv"))
	{
		fs.writeFileSync(babadata.datalocation + "loggedUsersVCC.csv", "");
	}

	// Append voice change as CSV line: newMemberID,newChannelID,oldMemberID,oldChannelID,timestamp,guildID
	// This creates a queue that will be replayed when database connection is restored
	fs.appendFileSync(babadata.datalocation + "loggedUsersVCC.csv", newMemberID + "," + newChannelID + "," + oldMemberID + "," + oldChannelID + "," + time + "," + guildID + "\n");
}

/**
 * Processes queued voice channel changes from CSV after DB restore
 *
 * Called by dbErrored() after database connection is restored. Reads CSV of
 * failed voice activity logs, clears the CSV, and replays each event to database
 * sequentially with 100ms delay between each to prevent overwhelming reconnected DB.
 *
 * Side effects:
 * - Reads loggedUsersVCC.csv file
 * - Clears loggedUsersVCC.csv immediately after reading
 * - Processes each line through voiceChannelChangeLOGGED
 * - May write voice activity records to database
 *
 * @see logVCC
 * @see voiceChannelChangeLOGGED
 * @see saveStuff
 */
function clearVCCList()
{
	// Load all queued voice changes that occurred during database downtime
	var loggedUsersVCC = fs.readFileSync(babadata.datalocation + "loggedUsersVCC.csv");

	// Clear CSV immediately to prevent re-processing if bot crashes during replay
	fs.writeFileSync(babadata.datalocation + "loggedUsersVCC.csv", "");

	loggedUsersVCC = loggedUsersVCC.toString();

	// Parse CSV and replay each voice change to database
	// Format: newMemberID,newChannelID,oldMemberID,oldChannelID,timestamp,guildID
	// Process sequentially with delays to prevent overwhelming freshly restored database
    var lines = loggedUsersVCC.split("\n");
    async function processLinesSequentially(lines)
    {
        for (let i = 0; i < lines.length; i++)
            await saveStuff(lines[i], i); // Delays by (100ms * i) to stagger writes
    }
    processLinesSequentially(lines);
}

/**
 * Processes a single CSV line from voice activity queue with delay
 *
 * Helper for clearVCCList that parses CSV line and calls voiceChannelChangeLOGGED.
 * Uses setTimeout with 100ms * index delay to prevent overwhelming database with
 * rapid sequential writes after reconnection.
 *
 * CSV format: newMemberID,newChannelID,oldMemberID,oldChannelID,timestamp,guildID
 * Converts "null" strings to actual null, parses Unix timestamp to Date.
 *
 * @param {string} lineWhole - CSV line containing voice activity data
 * @param {number} i - Line index used to calculate delay (i * 100ms)
 * @returns {Promise<void>} Resolves after processing completes or fails
 */
function saveStuff(lineWhole, i)
{
    return new Promise((resolve) =>
    {
        setTimeout(function()
        {
            if (lineWhole.length > 0)
            {
                var line = lineWhole.split(",");
                var newMemberID = line[0];
                var newChannelID = line[1] == "null" ? null : line[1];
                var oldMemberID = line[2];
                var oldChannelID = line[3] == "null" ? null : line[3];
                var time = line[4];
                // convert time to Date object
                time = new Date(parseInt(time));

                var guildID = line[5];
                // voiceChannelChangeLOGGED is async, so wait for it to finish
                Promise.resolve(voiceChannelChangeLOGGED(newMemberID, oldMemberID, newChannelID, oldChannelID, time, guildID))
                    .then(() => resolve())
                    .catch(() => resolve());
            }
            else
                resolve();
        }, i * 100);
    });
}

/**
 * Processes historical voice channel change from CSV log
 *
 * Replays a voice activity event that was queued to CSV due to database failure.
 * Similar to voiceChannelChange but uses pre-recorded timestamps and doesn't
 * handle Shadow Realm channel status updates. On failure, re-logs to CSV.
 *
 * Side effects:
 * - Calls userJoinedVoice if user joined new channel (respects opt-in)
 * - Calls userLeftVoice if user left old channel
 * - Re-logs to CSV via logVCC if database write still fails
 *
 * @param {string} newMemberID - User ID after change
 * @param {string} oldMemberID - User ID before change
 * @param {string} newChannelID - Channel ID user joined (null if left all)
 * @param {string} oldChannelID - Channel ID user left (null if newly joined)
 * @param {Date} [overideTime=null] - Historical timestamp from CSV
 * @param {string} guildID - Discord guild ID
 */
function voiceChannelChangeLOGGED(newMemberID, oldMemberID, newChannelID, oldChannelID, overideTime = null, guildID)
{
	global.Bot.guilds.fetch(guildID).then(async guild =>
	{
        const VCCChangeAsync = async function()
        {
            if (newChannelID != null && newChannelID != oldChannelID && userOptValue(guild, newMemberID, "voice"))
            {
                var uJV = await userJoinedVoice(newMemberID, newChannelID, guild, overideTime);
                console.log("Join Update: " + uJV, false, true);
            }

            if (oldChannelID != null && newChannelID != oldChannelID)
            {
                var uLV = await userLeftVoice(oldMemberID, oldChannelID, guild, overideTime);
                console.log("Leave Update: " + uLV, false, true);
            }
        };

        if (newChannelID != oldChannelID)
        {
            VCCChangeAsync().then(() =>
            {
                console.log("Voice Channel Change Complete from Logged Values", false, true);
            }).catch((err) =>
            {
                DMMePlease("Error in Voice Channel Change from Logged Values: " + err);
                logVCC(newMemberID, newChannelID, oldMemberID, oldChannelID, guildID, overideTime);
            });
        }
	});
}

/**
 * Retrieves username from cache without throwing errors
 *
 * Wrapper around NameFromUserIDID that returns "No One" on failure instead of
 * rejecting. Used for display purposes where a fallback username is acceptable.
 *
 * @param {string} userid - Discord user ID
 * @returns {Promise<string>} Username or "No One" if not found
 */
function NameFromUserIDNoFakes(userid)
{
    var userDBItemPromise = new Promise((resolve, reject) => {
        NameFromUserIDID(userid).then((result) =>
        {
            resolve(result.PersonName);
        }).catch((err) =>
        {
            resolve("No One");
        });
    });

    return userDBItemPromise;
}

/**
 * Selects best username for member with priority order and sanitization
 *
 * Attempts to find a suitable display name by checking multiple sources in
 * specified priority order. Useful for consistent display names in voice channel
 * status updates and logs.
 *
 * Name sources:
 * - N: Discord server nickname (member.nickname)
 * - C: Cached name from database (historical name)
 * - G: Discord global display name (member.user.globalName)
 * - U: Discord username (member.user.username)
 *
 * @param {Discord.GuildMember} member - Discord guild member object
 * @param {string[]} [order=["N","C","G","U"]] - Priority order for name sources
 * @param {boolean} [regexTrim=true] - If true, removes all non-alphanumeric chars except spaces
 * @returns {Promise<string>} First available name from priority order, sanitized if requested
 */
async function PickThePerfectUsername(member, order = ["N", "C", "G", "U"], regexTrim = true)
{
	// 4-tier username fallback system:
	// N - Discord Nickname in Server (user-set per-server display name)
	// C - Cached Name from database (historical name, useful when Discord names are hidden)
	// G - Discord Global Nickname (user's cross-server display name)
	// U - Discord Username (permanent account name, always available)

    nName = member.nickname;
    cahcedName = await NameFromUserIDNoFakes(member.user.id);
    gName = member.user.globalName;
    uName = member.user.username;

    // Convert nulls to empty strings to enable priority checking
    if (nName == null)
        nName = "";
    if (cahcedName == null)
        cahcedName = "";
    if (gName == null || gName == "No One") // "No One" is Discord's placeholder for unset global names
        gName = "";
    if (uName == null)
        uName = "";

    // Sanitize names by removing emojis, special characters, Unicode that breaks image generation
    // Keeps only alphanumeric and spaces for safe display in images/logs
    if (regexTrim)
    {
        var regex = /[^a-zA-Z0-9 ]/g;
        nName = nName.replace(regex, '');
        cahcedName = cahcedName.replace(regex, '');
        gName = gName.replace(regex, '');
        uName = uName.replace(regex, '');
    }

	// Return first non-empty name according to priority order
	// Default order prefers server-specific names over global names
	for (const key of order)
	{
		switch (key)
		{
			case "N":
				if (nName != "") return nName;
				break;
			case "C":
				if (cahcedName != "") return cahcedName;
				break;
			case "G":
				if (gName != "") return gName;
				break;
			case "U":
				if (uName != "") return uName;
				break;
		}
	}

    // Fallback to username if all others are empty (should never happen, but defensive programming)
    return uName;
}

/**
 * Main handler for Discord voice state changes
 *
 * Triggered by Discord.js voiceStateUpdate event when users join/leave/switch voice
 * channels. Tracks activity in database and manages special "Shadow Realm" channel
 * status that displays sleeping users.
 *
 * Special handling:
 * - Shadow Realm channel: Updates channel status with list of sleeping users
 * - Respects user voice tracking opt-in preference
 * - On database error: Logs to CSV via logVCC for later replay
 *
 * Side effects:
 * - Calls userJoinedVoice if user joined new channel
 * - Calls userLeftVoice if user left old channel
 * - Updates Shadow Realm channel status via channelStatusChange
 * - May log to CSV if database fails
 *
 * @param {Discord.VoiceState} newMember - Voice state after change
 * @param {Discord.VoiceState} oldMember - Voice state before change
 */
function voiceChannelChange(newMember, oldMember)
{
    const VCCChangeAsync = async function()
    {
        var newUserID = newMember.id;
        var oldUserID = oldMember.id;
        var newUserChannel = newMember.channelId;
        var oldUserChannel = oldMember.channelId;

        var guild = newMember.guild;

        var shadowRealmChannel = babadata.testing === undefined ? "454464489681715200" : "1240062704966832209";

        if (newUserChannel == shadowRealmChannel || oldUserChannel == shadowRealmChannel)
        {
            const { channelStatusChange } = require('../HelperFunctions/basicHelpers');

            var usersInShadowRealm = await guild.channels.fetch(shadowRealmChannel).then(channel => channel.members.map(member => member.id));
            if (usersInShadowRealm.length == 0)
                channelStatusChange(shadowRealmChannel, "");
            else
            {
                var userNamedList = [];
                for (var i = 0; i < usersInShadowRealm.length; i++)
                {
                    var userID = usersInShadowRealm[i];
                    var userName = await PickThePerfectUsername(guild.members.cache.get(userID), ["C", "N", "G", "U"], true);
                    userNamedList.push(userName);
                }

                // join the names with commas without the last comma and having an and before the last name
                var userNamedListString = userNamedList.join(", ");
                if (userNamedList.length > 1)
                	userNamedListString = userNamedListString.substring(0, userNamedListString.lastIndexOf(",")) + (userNamedList.length > 2 ? "," : "") + " and" + userNamedListString.substring(userNamedListString.lastIndexOf(",") + 1);
                else if (userNamedList.length == 1)
                	userNamedListString = userNamedList[0];

                userNamedListString += (userNamedList.length > 1 ? " are" : " is") + " Sleeping, please do not wake" + (userNamedList.length > 1 ? " them" : "") + ".";

                channelStatusChange(shadowRealmChannel, userNamedListString);
            }
        }

        if (newUserChannel != null && newUserChannel != oldUserChannel && await userOptValue(guild, newUserID, "voice"))
        {
            var uJV = await userJoinedVoice(newUserID, newUserChannel, guild);
            console.log("Join Update: " + uJV, false, true);
        }
    
        if (oldUserChannel != null && newUserChannel != oldUserChannel)
        {
            var uLV = await userLeftVoice(oldUserID, oldUserChannel, guild);
            console.log("Leave Update: " + uLV, false, true);
        }
    }
    
    if (newMember.channelId != oldMember.channelId)
    {
        VCCChangeAsync().then(() =>
        {
            console.log("Voice Channel Change Complete", false, true);
        }).catch((err) => 
        {
            DMMePlease("Error in Voice Channel Change: " + err);
            logVCC(newMember.id, newMember.channelId, oldMember.id, oldMember.channelId, newMember.guild.id);
        });
    }
}

/**
 * Checks user's opt-in status for a feature type
 *
 * Reads from optscache.json to determine if user has opted in/out of a feature.
 * If user has no preference recorded, prompts them in bot channel and defaults
 * to opt-out (opt-in for testing mode).
 *
 * Side effects:
 * - May create user record via CheckAndCreateUser
 * - May insert opt record via optIn/optOut
 * - Sends prompt message to bot channel if user has no preference
 *
 * @param {Discord.Guild} guild - Discord guild object
 * @param {string} userID - Discord user ID
 * @param {string} val - Feature type to check (e.g., "voice")
 * @returns {Promise<boolean>} True if opted in, false if opted out or no preference
 */
function userOptValue(guild, userID, val)
{
    var PromisedOptVal = new Promise((resolve, reject) => {
        let rawdata = fs.readFileSync(babadata.datalocation + "optscache.json");
        let optscache = JSON.parse(rawdata);
    
        for (var i = 0 ; i < optscache.length; i++)
        {
            var opt = optscache[i];
            if (opt.DiscordID == userID && opt.Item == val)
            {
                resolve(opt.Opt == "in");
                return;
            }
        }
        
        guild.members.fetch(userID)
        .then(user => 
        {
            CheckAndCreateUser(userID, user.user.username).then(async (result) => 
            {
                var OptInOrOut = null;
                if (babadata.testing != undefined)
                    OptInOrOut = optIn;
                else
                    OptInOrOut = optOut;

                OptInOrOut(user, val).then((result) =>
                {
                    guild.channels.fetch(babadata.botchan).then(channel => {
                        channel.send("<@" + userID + "> would you like to opt in for baba voice activity data analysis?\n"
                        + "Type `/optin` to opt in, or `/optout` to opt out (default).\n" + 
                        "This data will be used to create fun charts and do predictive analysis of voice activity.\n" +
                        "If you don't want to see this message, call one of the commands.\n" +
                        "Check out <#1069025445162524792> to see some cool charts that were made over the years.");
                    })
                    .catch(console.error);
                
                    // do the @ of person and add to opt out first
                    console.log("No In"); 

                    resolve(false);
                })
                .catch((err) => {
                    console.log(err);
                    resolve(false);
                });
            })
            .catch((err) => {
                console.log(err);
                resolve(false);
            });
        });
    });

    return PromisedOptVal;
}

// ============================================
// Slash Friday Saving Functions
// ============================================

/**
 * Saves accumulated Slash Friday data to database
 *
 * Triggered periodically to persist in-memory Friday message counters to database.
 * Only runs in production mode unless testingOveride is true. Calls IncrementCounters
 * which handles both Friday counter (layersdeep table) and Friday messages (myitisfriday table).
 *
 * Side effects:
 * - Calls IncrementCounters which writes to database
 * - Clears global.fridayCounter and fridayCounter.json after successful save
 *
 * @param {boolean} [testingOveride=false] - If true, saves even in testing mode
 * @returns {Promise<string>} Status message indicating success or why save was skipped
 */
function SaveSlashFridayJson(testingOveride = false)
{
    var PromisedSave = new Promise((resolve, reject) =>
    {
        var retVal = "Friday Counter has not been updated, as it is Empty";
        if ((global.dbAccess[1] && global.dbAccess[0]))
        {
            if (testingOveride && babadata.testing !== undefined)
            {
                console.log("Saving Friday Counter to Database (Testing Overide)", false, true);
                IncrementCounters().then(() =>
                {
                    retVal = "Friday Counter Updated (Testing Overide)";
                    resolve(retVal);
                }).catch((err) => {resolve("Friday Counter Failed to Update (Testing Overide): " + err)});
            }
    
            // save to database
            if (babadata.testing === undefined)
            {
                console.log("Saving Friday Counter to Database", false, true);
                IncrementCounters().then(() =>
                {
                    retVal = "Friday Counter Updated";
                    resolve(retVal);
                }).catch((err) => {resolve("Friday Counter Failed to Update: " + err)});
            }
        }

        resolve(retVal);
    });

    return PromisedSave;
}

/**
 * Saves both Friday counters and messages to database
 *
 * Orchestrates saving of two types of Friday data:
 * 1. Layer depth counters (how nested the Friday messages are)
 * 2. Full message content for Friday messages
 *
 * Side effects:
 * - Calls FridayCounterIncrement (writes to layersdeep table)
 * - Calls FridayMessagesUpdate (writes to myitisfriday table)
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} Error description on failure
 */
function IncrementCounters()
{
    const CounterAsync = async function()
    {
        // Increment Friday Counter
        const FridayResult = await FridayCounterIncrement();
        console.log("Friday Counter: " + FridayResult, false, true);

        // Increment Friday Messages
        const FridayMessagesResult = await FridayMessagesUpdate();
        console.log("Friday Messages: " + FridayMessagesResult, false, true);
    }

    var PromisedIncrement = new Promise((resolve, reject) =>
    {
        CounterAsync().then(() => 
        {
            console.log("All Counters Incremented", false, true);
            resolve("SuccCess");
        }).catch((err) => 
        {
            DMMePlease("Error Incrementing Counters: " + err);
            reject("IncrementCounters: " + err);
        });
    });

    return PromisedIncrement;
}

/**
 * Saves Friday message nesting depth counters to database
 *
 * Reads fridayCounter.json containing accumulated layer depth statistics for
 * Friday messages and bulk inserts/updates to layersdeep table. Tracks how many
 * times each user used each heading level at each nesting depth for each Friday UID.
 *
 * SQL: INSERT INTO layersdeep (...) AS newDeepLayers ON DUPLICATE KEY UPDATE Count = Count + newCount
 *
 * Side effects:
 * - Bulk writes to layersdeep table
 * - Clears fridayCounter.json after successful save
 * - Clears global.fridayCounter object
 * - On error: Sends fridayCounter.json to admin log via DMMEAFile
 *
 * @returns {Promise<string>} "SuccCess" or "Friday Counter Empty"
 * @throws {string} "FridayCounter" on database error
 */
function FridayCounterIncrement()
{
    var PromisedFridayCounter = new Promise((resolve, reject) =>
    {
        var fridayJson = fs.readFileSync(babadata.datalocation + "fridayCounter.json");
        var friday = JSON.parse(fridayJson);
        var qureyStart = "INSERT INTO layersdeep (FridayUID,LoopsOrDOW,LayersDeep,Count,HeadingLevel,Sender) VALUES "
        var qureyEnd = `AS newDeepLayers ON DUPLICATE KEY UPDATE layersdeep.Count = layersdeep.Count + newDeepLayers.Count;`;
        var queryMiddle = "";

        for (var i = 0; i < Object.keys(friday).length; i++)
        {
            var key = Object.keys(friday)[i];
            var layersdeeps = friday[key];

            // uid is key before --, group is key after --
            var uid = key.split("--")[0];
            var group = key.split("--")[1];
            var user = key.split("--")[2];


            // update the value in the database for each layer in value, on new entry add it
            for (var deepness = 0; deepness < layersdeeps.length; deepness++)
            {
                var headingLevels = layersdeeps[deepness];
                if (headingLevels != null)
                {
                    for (var heding = 0; heding < headingLevels.length; heding++)
                    {
                        var count = headingLevels[heding];
                        if (count != null)
                            queryMiddle += `("${uid}", "${group}", "${deepness}", "${count}", "${heding}", "${user}"),`;
                    }
                }
            }
        }
        queryMiddle = queryMiddle.slice(0, -1);

        if (queryMiddle.length == 0)
        {
            resolve("Friday Counter Empty");
            return;
        }

        var query = qureyStart + queryMiddle + qureyEnd;
        callSQLQuery(query)
        .then((result) =>
        {
			var data = {};
			fs.writeFileSync(babadata.datalocation + "fridayCounter.json", JSON.stringify(data));
            global.fridayCounter = {};
            resolve("SuccCess");
        })
        .catch((err) => 
        {
            DMMePlease("Error Incrementing Friday Counter: " + err);
            DMMEAFile("fridayCounter.json", fridayJson, "Friday Counter Increment Error Data");
            reject("FridayCounter");
        });
    });

    return PromisedFridayCounter;
}

/**
 * Saves Friday message contents to database
 *
 * Reads fridaymessages.json containing full text of Friday messages and bulk
 * inserts to myitisfriday table. Stores message text, condensed notation,
 * timestamp, seed, and file version for each Friday message.
 *
 * SQL: INSERT INTO myitisfriday (Sender,TimeStamp,Message,Condensed,Seed,FileVersion) VALUES (...)
 *
 * Side effects:
 * - Bulk inserts to myitisfriday table
 * - Clears fridaymessages.json after successful save
 * - On error: Sends fridaymessages.json to admin log via DMMEAFile
 *
 * @returns {Promise<string>} "SuccCess" or "Friday Messages Empty"
 * @throws {string} "FridayMessages" on database error
 */
function FridayMessagesUpdate()
{
    var PromisedFridayMessages = new Promise((resolve, reject) =>
    {
        var fridayMessages = fs.readFileSync(babadata.datalocation + "fridaymessages.json");
        var friday = JSON.parse(fridayMessages);

        if (friday.length == 0)
        {
            resolve("Friday Messages Empty");
            return;
        }

        var qureyStart2 = `INSERT INTO myitisfriday (Sender,TimeStamp,Message,Condensed,Seed,FileVersion) VALUES `;
        var queryMiddle2 = "";

        for (var i = 0; i < friday.length; i++)
        {
            // var fmdItem = { "UID": authorID, "Text": text, "Date": tod, "CondensedNotation": cnFull, "Seed": seed, "FileVersion": fc };
            var fmdItem = friday[i];
            var sender = fmdItem.UID;
    
            var d1 = new Date(fmdItem.Date);
            var mpre1 = d1.getMonth() + 1 < 10 ? 0 : "";
            var dpre1 = d1.getUTCDate() < 10 ? 0 : "";
    
            var time = `${d1.getFullYear()}-${mpre1}${d1.getMonth() + 1}-${dpre1}${d1.getDate()} ${d1.getHours()}:${d1.getMinutes()}:${d1.getSeconds()}`
            
            var msg = fmdItem.Text;
            // replace all " with ""
            msg = msg.replace(/"/g, '""');
            var cond = fmdItem.CondensedNotation;
            // if cond is object, convert to string
            if (typeof cond === 'object')
            {
                cond = JSON.stringify(cond);
                cond = cond.replace(/"/g, '""');
            }
    
            var seed = fmdItem.Seed;
    
            // add to query
            queryMiddle2 += `("${sender}", "${time}", "${msg}", "${cond}", "${seed}", "${fmdItem.FileVersion}"),`;
        }
    
        // remove last comma
        queryMiddle2 = queryMiddle2.slice(0, -1);

        var query2 = qureyStart2 + queryMiddle2;
        callSQLQuery(query2)
        .then((result) =>
        {
			var data = [];
			fs.writeFileSync(babadata.datalocation + "fridaymessages.json", JSON.stringify(data));
            resolve("SuccCess");
        })
        .catch((err) => 
        {
            DMMePlease("Error Updating Friday Messages: " + err);
            DMMEAFile("fridaymessages.json", fridayMessages, "Friday Messages Update Error Data");
            reject("FridayMessages");
        });
    });

    return PromisedFridayMessages;
}

// ============================================
// Cache Functions
// ============================================

/**
 * Loads all bot cache data from database to JSON files
 *
 * Master function that orchestrates loading all cache types sequentially.
 * Called on bot startup to populate local cache files from database.
 * Each cache loader queries database and writes to corresponding JSON file.
 *
 * Caches loaded:
 * - Emoji, React, Fish, Frog, Frog Control, DOW Items
 * - Channel Names (to global.channelCache), User Values (to global.userCache)
 * - Pleased, Pleased Override, Opts, Holidays, Haikus
 * - Friday (DOW), Friday Control, Friday Loops, Time Gates
 *
 * Side effects:
 * - Writes multiple JSON cache files to babadata.datalocation
 * - Populates global.channelCache and global.userCache objects
 *
 * @returns {Promise<string>} "SuccCess" when all caches loaded
 * @throws {string} "AllCache" if any cache fails to load
 */
function LoadAllTheCache()
{
    const CachceAsync = async function() 
    {
        // Emoji Cache
        const EmojiResult = await LoadEmojiCache();
        console.log("Emoji Cache: " + EmojiResult, false, true);

        // React Values - REACTOcache.json - `Select * from reacto`
        const ReactResult = await LoadReactCache();
        console.log("React Cache: " + ReactResult, false, true);

        // Fish Values - FISHcache.json - `Select * from fishdb`
        const FishResult = await LoadFishCache();
        console.log("Fish Cache: " + FishResult, false, true);

        // Frog Values - FROGcache.json - `Select * from frog`
        const FrogResult = await LoadFrogCache();
        console.log("Frog Cache: " + FrogResult, false, true);
        // Frog Control Options - FROGcontrol.json - `Select * from frogcontrol`
        const FrogControlResult = await LoadFrogControlCache();
        console.log("Frog Control Cache: " + FrogControlResult, false, true);

        // DOWItems Cache - DOWItems.json - `Select * from dow` -> `Select * from dowitems`
        const DOWItemsResult = await LoadDOWItemsCache();
        console.log("DOWItems Cache: " + DOWItemsResult, false, true);

        // Channel Name Cache - channelCache.json - `Select * from channelval`
        const ChannelNamesResult = await LoadChannelNamesCache();
        console.log("Channel Names Cache: " + ChannelNamesResult, false, true);

        // User Name Cache - userCache.json - `Select * from userval`
        const UserValuesResult = await LoadUserValuesCache();
        console.log("User Values Cache: " + UserValuesResult, false, true);
        
        // Please Values - Pleasedcache.json - `SELECT PersonName, UserID, DefaultNormalChance, DefaultH1Chance, DefaultH2Chance, DefaultH3CHance, DefaultRNGFontChance, DefaultFlagChance FROM pleased
                                            // Left Join userval on pleased.UserID = userval.DiscordID;`
        const PleasedResult = await LoadPleasedCache();
        console.log("Pleased Cache: " + PleasedResult, false, true);
        // Please Overide Options - PleasedOVERIDEcache.json - `SELECT PersonName, OverideUserIDs, UserID, DefaultNormalChance, DefaultH1Chance, DefaultH2Chance, DefaultH3CHance, DefaultRNGFontChance, DefaultFlagChance FROM pleasedOverides
                                                            //  Left Join userval on pleasedOverides.UserID = userval.DiscordID;`
        const PleasedOverideResult = await LoadPleasedOverideCache();
        console.log("Pleased Overide Cache: " + PleasedOverideResult, false, true);    
        
        // Baba Wednesday Database
        const BabaWednesdayResult = await LoadHolidaysCache();
        console.log("Baba Wednesday Cache: " + BabaWednesdayResult, false, true);

        // Haiku Database
        const HaikuResult = await LoadHaikusCache();
        console.log("Haiku Cache: " + HaikuResult, false, true);

        // Opts Cache - optscache.json - `Select * from opting`
        const OptResult = await LoadOptCache();
        console.log("Opts Cache: " + OptResult, false, true);
    
        // Slash Friday Values -- DOWcache.json - `SELECT * FROM dowfunny left join fridaytimegates on dowfunny.UID = fridaytimegates.fUID`
            // Friday Control Options -- DOWcontrol.json - `Select * from dowcontrol`
            // Friday Sub Options -- FridayLoops.json - `Select * from fridaynestedloops`
            // Time Gates -- TimeGates.json - `Select * from timegatess`
        const FridayResult = await LoadAllSlashFridayStuff();
        console.log("Friday Cache: " + FridayResult, false, true);

        // TODO: On the first of the month, update frogholidays folder from downloading bikus.org/frogholidays.zip, and to add a flag to force download images from force cache download
    }

    var PromisedAllCache = new Promise((resolve, reject) =>
    {
        CachceAsync().then(() => 
        {
            console.log("All Cache Loaded", false, true);
            resolve("SuccCess");
        }).catch((err) => 
        {
            DMMePlease("Error Loading Cache: " + err);
            reject("AllCache");
        });
    });

    return PromisedAllCache;
}

/**
 * Loads emoji data from external repository and groups by skin tones
 *
 * Fetches emoji list from GitHub repository, groups emojis with skin tone
 * variations together, and caches to local JSON file for offline use.
 *
 * Side effects:
 * - Fetches from https://raw.githubusercontent.com/chalda-pnuzig/emojis.json/
 * - Writes to emojiJSONCache.json
 * - Groups emoji variants by skin tone via groupEmojiByTones
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Emoji" on fetch or parse error
 */
function LoadEmojiCache()
{
    var PromisedEmoji = new Promise((resolve, reject) =>
    {
        var emojiurl = "https://raw.githubusercontent.com/chalda-pnuzig/emojis.json/refs/heads/master/src/list.with.modifiers.json";

        fetch(emojiurl).then(res => res.json()).then(json => {
            // save to emojiJSONCache
            var newEmojis = groupEmojiByTones(json);
            json.emojis = newEmojis;

            fs.writeFileSync(babadata.datalocation + "emojiJSONCache.json", JSON.stringify(json));
            resolve("SuccCess");
        }).catch((err) => {reject("Emoji")});
    });

    return PromisedEmoji;
}

/**
 * Loads reaction triggers from database to cache file
 *
 * Queries reacto table and transforms data for reaction detection system.
 * Processes phrase triggers, alternate/ignored phrases, react emoji IDs with
 * weighted chances, and time-based availability (with dates adjusted to current year).
 *
 * SQL: Select * from reacto
 *
 * Side effects:
 * - Writes to REACTOcache.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "React" on database error
 */
function LoadReactCache()
{
    var PromisedReact = new Promise((resolve, reject) =>
    {
        var query = `Select * from reacto`;
        var jsonLocation = babadata.datalocation + "REACTOcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                var resj = 
                {
                    "Phrase": res.phrase,
                    "ReactIDs": res.reactIDs,
                    "AlternatePhrases": res.altPhrases,
                    "IgnoredPhrases": res.ignorePhrases,
                    "IgnorePlease": res.IgnorePlease,
                    "StartDate": res.StartTime,
                    "EndDate": res.EndTime,
                    "Prompt": res.Prompt,
                }
    
                // if startdate != null set year to this year
                if (resj.StartDate != null)
                    resj.StartDate.setFullYear(getD1().getFullYear());
    
                // if enddate != null set year to this year
                if (resj.EndDate != null)
                    resj.EndDate.setFullYear(getD1().getFullYear());
    
                // if startdate == null set to earliest date
                if (resj.StartDate == null)
                    resj.StartDate = new Date(0);
    
                // if enddate == null set to latest date
                if (resj.EndDate == null)
                    resj.EndDate = new Date(8640000000000000);
    
                // split reactIDs by comma
                resj.ReactIDs = resj.ReactIDs.split(",");
                for (var j = 0; j < resj.ReactIDs.length; j++)
                {
                    // trim spaces
                    resj.ReactIDs[j] = resj.ReactIDs[j].trim();
                    var reactID = resj.ReactIDs[j].split(":");
                    resj.ReactIDs[j] = {"ID": reactID[0], "Chance": reactID[1] ? reactID[1] : 100};
                }
    
                // loop through reactIDs and add id to ReactIDList, chance number of times
                resj.ReactIDList = [];
                for (var j = 0; j < resj.ReactIDs.length; j++)
                {
                    for (var k = 0; k < resj.ReactIDs[j].Chance; k++)
                    {
                        resj.ReactIDList.push(resj.ReactIDs[j].ID);
                    }
                }
    
                // split altPhrases by comma, if not null
                if (resj.AlternatePhrases != null)
                    resj.AlternatePhrases = resj.AlternatePhrases.split(",");
                else 
                    resj.AlternatePhrases = [];
    
                // loop through alternate phrases and change from "val" to ["val"], or "a+b" to ["a", "b"]
                for (var j = 0; j < resj.AlternatePhrases.length; j++)
                {
                    // trim spaces
                    resj.AlternatePhrases[j] = resj.AlternatePhrases[j].trim();
                    resj.AlternatePhrases[j] = resj.AlternatePhrases[j].split("+");
                }
    
                // split ignoredPhrases by comma, if not null
                if (resj.IgnoredPhrases != null)
                    resj.IgnoredPhrases = resj.IgnoredPhrases.split(",");
                else
                    resj.IgnoredPhrases = [];
    
                // loop through ignored phrases and change from "val" to ["val"], or "a+b" to ["a", "b"]
    
                for (var j = 0; j < resj.IgnoredPhrases.length; j++)
                {
                    // trim spaces
                    resj.IgnoredPhrases[j] = resj.IgnoredPhrases[j].trim();
                    resj.IgnoredPhrases[j] = resj.IgnoredPhrases[j].split("+");
                }
    
                opts.push(resj);
            }
    
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("React")});
    });

    return PromisedReact;
}

/**
 * Loads fish image triggers from database to cache file
 *
 * Queries fishdb table containing fish image URLs and trigger words.
 * Fish images are posted when specific words/phrases appear in messages.
 *
 * SQL: Select * from fishdb
 *
 * Side effects:
 * - Writes to FISHcache.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Fish" on database error
 */
function LoadFishCache()
{
    var PromisedFish = new Promise((resolve, reject) =>
    {
        var query = `Select * from fishdb`;
        var jsonLocation = babadata.datalocation + "FISHcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                text = "https://bikus.org/Images/Fish/" + res.FishIMGURL;
                var resj = 
                {
                    "url": text,
                    "FishWords": res.FishWords,
                    "FishBuff": res.WithFishMultBuff,
                    "ProcFishless": res.ProcOnWordsNoFish,
                    "ProcChance": res.ProcChance,
                    "DefaultOccCount": res.DefaultOccCount,
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Fish")});
    });

    return PromisedFish;
}

/**
 * Loads pending reminders from database to cache file
 *
 * Queries reminders table filtered by testing mode. Adjusts timestamps for
 * timezone offset and structures reminder data for scheduler system.
 *
 * SQL: Select * from reminders where Testing = [0 or 1]
 *
 * Side effects:
 * - Writes to reminders.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Reminders" on database error
 */
function LoadReminderCache()
{
    var PromisedReminders = new Promise((resolve, reject) =>
    {
        var testIndex = babadata.testing === undefined ? "0" : "1";

        var query = `Select * from reminders where Testing = ` + testIndex;
        var jsonLocation = babadata.datalocation + "reminders.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];

                var files = null;
                if (res.Files != null && res.Files.length > 0)
                    files = res.Files.split(",");

                
                var ctimez = new Date(res.Date);
                var offset = ctimez.getTimezoneOffset();
                ctimez.setMinutes(ctimez.getMinutes() - offset);

                var resj = 
                {
                    "Source": res.Source,
                    "Message": res.Message,
                    "Files": files,
                    "Date": ctimez,
                    "ChannelID": res.ChannelID,
                    "UserID": res.UserID,
                    "ThreadParentID": res.ThreadParentID == "null" ? null : res.ThreadParentID,
                    "EnableAtPerson": res.EnabledAtPerson,
                    "State": "Pending",
                    "ID": res.ID,
                    "UpdateDB": false
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Reminders")});
    });

    return PromisedReminders;
}

/**
 * Loads Wednesday frog images from database to cache file
 *
 * Queries frog table containing frog image links posted on Wednesdays.
 * Each frog can be enabled/disabled and have user ID overrides.
 *
 * SQL: Select * from frog
 *
 * Side effects:
 * - Writes to FROGcache.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Frog" on database error
 */
function LoadFrogCache()
{
    var PromisedFrog = new Promise((resolve, reject) =>
    {
        var query = `Select * from frog`;
        var jsonLocation = babadata.datalocation + "FROGcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				text = res.froglink;
				var resj = 
				{
					"text": text,
					"enabledDef": res.enabled,
					"IDS": res.overideIDs
				}

				opts.push(resj);
			}
            
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Frog")});
    });

    return PromisedFrog;
}

/**
 * Loads frog control settings from database to cache file
 *
 * Queries frogcontrol table containing user/channel permission levels for
 * Wednesday frog feature. Controls who can see frogs.
 *
 * SQL: Select * from frogcontrol
 *
 * Side effects:
 * - Writes to FROGcontrol.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "FrogControl" on database error
 */
function LoadFrogControlCache()
{
    var PromisedFrogControl = new Promise((resolve, reject) =>
    {
        var query = `Select * from frogcontrol`;
        var jsonLocation = babadata.datalocation + "FROGcontrol.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
				var resj = 
				{
					"ID": res.IDFROGControl,
					"Control": res.controlLevel
				}

                opts.push(resj);
            }
            
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("FrogControl")});
    });

    return PromisedFrogControl;
}

/**
 * Loads day-of-week special items from database to cache file
 *
 * Queries dow and dowitems tables for special day-based content (e.g., themed
 * words/phrases for specific days). Includes probability, time windows, and items.
 *
 * SQL: Select * from dow, then Select * from dowitems
 *
 * Side effects:
 * - Writes to DOWItems.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "DOWItems" on database error
 */
function LoadDOWItemsCache()
{
    var PromisedDOWItems = new Promise((resolve, reject) =>
    {
        var query = `Select * from dow`;
        var jsonLocation = babadata.datalocation + "DOWItems.json";

        callSQLQuery(query)
        .then((result) =>
        {
			var adam = {};
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				adam[res.date] = {};
				adam[res.date].Probaility = res.probablilty;
				adam[res.date].Items = [];
				adam[res.date].Start = res.starttime;
				adam[res.date].End = res.endtime;
			}

            var query = `Select * from dowitems`;
            callSQLQuery(query)
            .then((result) =>
            {
                for (var i = 0; i < result.length; i++)
                {
                    var res = result[i];
                    var itm = {};
                    itm.Name = res.name;
                    itm.Occurances = res.occ;
                    
                    adam[res.dow].Items.push(itm);
                }

                var data = JSON.stringify(adam);
                fs.writeFileSync(jsonLocation, data);
                resolve("SuccCess");
            })
            .catch((err) => {reject("DOWItems")});
        })
        .catch((err) => {reject("DOWItems")});
    });

    return PromisedDOWItems;
}

/**
 * Loads channel ID to name mapping into global cache
 *
 * Queries channelval table and populates global.channelCache object for fast
 * channel name lookups throughout the application.
 *
 * SQL: Select * from channelval
 *
 * Side effects:
 * - Populates global.channelCache object
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "ChannelNames" on database error
 */
function LoadChannelNamesCache()
{
    var PromisedChannelNames = new Promise((resolve, reject) =>
    {
        var query = `Select * from channelval`;
        global.channelCache = {};
    
        callSQLQuery(query)
        .then((result) =>
        {
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                global.channelCache[res.ChannelID] = res.ChannelName;
            }
            resolve("SuccCess");
        })
        .catch((err) => {reject("ChannelNames")});
    });

    return PromisedChannelNames;
}

/**
 * Loads user ID to name mapping with alternate names into global cache
 *
 * Queries userval table joined with alteventnames to get primary username and
 * alternative names (e.g., birthday event names). Populates global.userCache.
 *
 * SQL: SELECT * FROM userval Left join alteventnames on BirthdayEventID = EventID
 *
 * Side effects:
 * - Populates global.userCache object with PersonName and AltNames array
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "UserValues" on database error
 */
function LoadUserValuesCache()
{
    var PromisedUserValues = new Promise((resolve, reject) =>
    {
        var query = `SELECT * FROM userval Left join alteventnames on BirthdayEventID = EventID`;
        global.userCache = {};
    
        callSQLQuery(query)
        .then((result) =>
        {
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                if (global.userCache[res.DiscordID] != null)
                {
                    global.userCache[res.DiscordID].AltNames.push(res.EventName);
                }
                else
                {
                    var resj =
                    {
                        "PersonName": res.PersonName,
                        "AltNames": [ res.EventName ]
                    }
                    global.userCache[res.DiscordID] = resj;
                }
            }
            resolve("SuccCess");
        })
        .catch((err) => {reject("UserValues")});
    });

    return PromisedUserValues;
}

/**
 * Loads "please" response probability settings from database to cache file
 *
 * Queries pleased table for user-specific response chance settings when "please"
 * is detected in messages. Controls formatting probabilities (normal, heading levels,
 * random font, flag emojis).
 *
 * SQL: SELECT ... FROM pleased Left Join userval on pleased.UserID = userval.DiscordID
 *
 * Side effects:
 * - Writes to Pleasedcache.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Pleased" on database error
 */
function LoadPleasedCache()
{
    var PromisedPleased = new Promise((resolve, reject) =>
    {
        var query = `SELECT PersonName, UserID, DefaultNormalChance, DefaultH1Chance, DefaultH2Chance, DefaultH3CHance, DefaultRNGFontChance, DefaultFlagChance FROM pleased
	                 Left Join userval on pleased.UserID = userval.DiscordID;`;
        var jsonLocation = babadata.datalocation + "Pleasedcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                var resj = 
                {
                    "PersonName": res.PersonName,
                    "UserID": res.UserID,
                    "DefaultNormalChance": res.DefaultNormalChance,
                    "DefaultH1Chance": res.DefaultH1Chance,
                    "DefaultH2Chance": res.DefaultH2Chance,
                    "DefaultH3CHance": res.DefaultH3CHance,
                    "DefaultRNGFontChance": res.DefaultRNGFontChance,
                    "DefaultFlagChance": res.DefaultFlagChance,
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Pleased")});
    });

    return PromisedPleased;
}

/**
 * Loads "please" response overrides from database to cache file
 *
 * Queries pleasedOverides table for special response settings that apply when
 * specific users say "please" to other specific users. Allows customized response
 * probabilities per user pair.
 *
 * SQL: SELECT ... FROM pleasedOverides Left Join userval on pleasedOverides.UserID = userval.DiscordID
 *
 * Side effects:
 * - Writes to PleasedOVERIDEcache.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "PleasedOveride" on database error
 */
function LoadPleasedOverideCache()
{
    var PromisedPleasedOveride = new Promise((resolve, reject) =>
    {
        var query = `SELECT PersonName, OverideUserIDs, UserID, DefaultNormalChance, DefaultH1Chance, DefaultH2Chance, DefaultH3CHance, DefaultRNGFontChance, DefaultFlagChance FROM pleasedOverides
                     Left Join userval on pleasedOverides.UserID = userval.DiscordID;`;
        var jsonLocation = babadata.datalocation + "PleasedOVERIDEcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
			var opts = {};
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				var resj = 
				{
					"UID": res.UserID,
					"OverideUIDs": res.OverideUserIDs,
					"DefaultNormalChance": res.DefaultNormalChance,
					"DefaultH1Chance": res.DefaultH1Chance,
					"DefaultH2Chance": res.DefaultH2Chance,
					"DefaultH3Chance": res.DefaultH3CHance,
					"DefaultRNGFontChance": res.DefaultRNGFontChance,
					"DefaultFlagChance": res.DefaultFlagChance
				}

				opts[res.PersonName] = resj;
			}

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("PleasedOveride")});
    });

    return PromisedPleasedOveride;
}

/**
 * Loads user opt-in/out preferences from database to cache file
 *
 * Queries opting table for user preferences on various bot features (e.g., voice
 * tracking, mentions). Used to respect user privacy choices.
 *
 * SQL: Select * from opting
 *
 * Side effects:
 * - Writes to optscache.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Opts" on database error
 */
function LoadOptCache()
{
    var PromisedOpt = new Promise((resolve, reject) =>
    {
        var query = `Select * from opting`;
        var jsonLocation = babadata.datalocation + "optscache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				var resj = {
					"DiscordID": res.DiscordID,
					"Item": res.ItemToRemove,
					"Opt": res.Val
				}
				opts.push(resj);
			}

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Opts")});
    });

    return PromisedOpt;
}

/**
 * Loads all Slash Friday data and manages versioning
 *
 * Comprehensive loader for Friday feature that:
 * 1. Loads time gates, Friday phrases (DOW), control settings, and nested loops
 * 2. Compares new data against existing cached data
 * 3. If changes detected: creates versioned backup in FridayCache folder and updates timegates
 * 4. Tracks all version changes in TimeGates.json and timegates table
 *
 * Side effects:
 * - Calls LoadTimeGatesCache, LoadFridayCache, LoadFridayControlCache, LoadFridayLoopsCache
 * - On changes: Writes versioned backups to FridayCache/[DOWcache|FridayLoops|DOWcontrol]N.json
 * - Updates TimeGates.json with new version entry
 * - Inserts new version record to timegates table
 *
 * @returns {Promise<string>} "SuccCess, Changes Detected" or "SuccCess, No Changes Detected"
 * @throws {string} Error description on failure
 */
function LoadAllSlashFridayStuff()
{
    var PromisedFriday = new Promise((resolve, reject) =>
    {
        // load in dowcache and fridayloops from json files
        let rawdata = fs.readFileSync(babadata.datalocation + "DOWcache.json");
        var tempdowcache = JSON.parse(rawdata);
        var newdowcache = null;

        let rawloops = fs.readFileSync(babadata.datalocation + "FridayLoops.json");
        var tempfridayloops = JSON.parse(rawloops);
        var newfridayloops = null;

        let rawcontrol = fs.readFileSync(babadata.datalocation + "DOWcontrol.json");
        var tempdowcontrol = JSON.parse(rawcontrol);
        var newdowcontrol = null;

        const FridayAsync = async function()
        {
            // Time Gates -- TimeGates.json - `Select * from timegatess`
            const TimeGatesResult = await LoadTimeGatesCache();
            console.log("Time Gates Cache: " + TimeGatesResult, false, true);

            // Slash Friday Values -- DOWcache.json - `SELECT * FROM dowfunny left join fridaytimegates on dowfunny.UID = fridaytimegates.fUID`
            newdowcache = await LoadFridayCache();
            console.log("Friday Cache: SuccCess", false, true);
            // Friday Control Options -- DOWcontrol.json - `Select * from dowcontrol`
            newdowcontrol = await LoadFridayControlCache();
            console.log("Friday Control Cache: SuccCess", false, true);
            // Friday Sub Options -- FridayLoops.json - `Select * from fridaynestedloops`
            newfridayloops = await LoadFridayLoopsCache();
            console.log("Friday Loops Cache: SuccCess", false, true);
        }

        FridayAsync().then(() => 
        {
            // we do the saving stuff here
            var changes = false;
            if (newdowcache.length != tempdowcache.length)
                changes = true;
            else
            {
                for (var i = 0; i < newdowcache.length; i++)
                {
                    if (newdowcache[i].text != tempdowcache[i].text)
                    {
                        changes = true;
                        break;
                    }
                }
            }

            if (!changes)
            {
                // compare newfridayloops to tempfridayloops
                if (Object.keys(newfridayloops).length != Object.keys(tempfridayloops).length)
                    changes = true;
                else
                {
                    for (var x in newfridayloops)
                    {
                        if (tempfridayloops[x] == null)
                        {
                            changes = true;
                            break;
                        }
                        if (newfridayloops[x].length != tempfridayloops[x].length)
                        {
                            changes = true;
                            break;
                        }
                        for (var i = 0; i < newfridayloops[x].length; i++)
                        {
                            if (newfridayloops[x][i].text != tempfridayloops[x][i].text)
                            {
                                changes = true;
                                break;
                            }
                        }
                        if (changes)
                            break;
                    }
                }
            }

            if (!changes)
            {
                // compare newdowcontrol to tempdowcontrol
                if (newdowcontrol.length != tempdowcontrol.length)
                    changes = true;
                else
                {
                    for (var i = 0; i < newdowcontrol.length; i++)
                    {
                        if (newdowcontrol[i].Control != tempdowcontrol[i].Control)
                        {
                            changes = true;
                            break;
                        }
                    }
                }
            }

            if (changes)
            {
                console.log("Changes Detected, Saving Cache", false, true);
                // if babadata.datalocation + "FridayCache" doesn't exist, create it
                if (!fs.existsSync(babadata.datalocation + "FridayCache"))
                {
                    fs.mkdirSync(babadata.datalocation + "FridayCache");
                }

                // save tempfridayloops to babadata.datalocation + "FridayCache/FridayLoops" + fcacheitems + ".json";
                var fcacheitems = 0;
                // set to number of files in directory / 3
                fs.readdir(babadata.datalocation + "FridayCache", (err, files) => {
                    fcacheitems = files.length / 3;
                    var data = JSON.stringify(tempfridayloops);
                    fs.writeFileSync(babadata.datalocation + "FridayCache/FridayLoops" + fcacheitems + ".json", data);
                });

                // save tempdowcache to babadata.datalocation + "FridayCache/DOWcache" + dcacheitems + ".json";
                var dcacheitems = 0;
                // set to number of files in directory / 3
                fs.readdir(babadata.datalocation + "FridayCache", (err, files) => {
                    dcacheitems = files.length / 3;
                    var data = JSON.stringify(tempdowcache);
                    fs.writeFileSync(babadata.datalocation + "FridayCache/DOWcache" + dcacheitems + ".json", data);
                });

                // save tempdowcontrol to babadata.datalocation + "FridayCache/DOWcontrol" + dcontrolitems + ".json";
                var dcontrolitems = 0;
                // set to number of files in directory / 3
                fs.readdir(babadata.datalocation + "FridayCache", (err, files) => {
                    dcontrolitems = files.length / 3;
                    var data = JSON.stringify(tempdowcontrol);
                    fs.writeFileSync(babadata.datalocation + "FridayCache/DOWcontrol" + dcontrolitems + ".json", data);
                });


                // update TimeGates.json by adding another row (items + 1)
                let rawdata = fs.readFileSync(babadata.datalocation + "TimeGates.json");
                var tempTimeGates = JSON.parse(rawdata);
                // get length of tempTimeGates
                var items = tempTimeGates.length;

                var ctimez = getD1(true);
                var offset = ctimez.getTimezoneOffset();
                ctimez.setMinutes(ctimez.getMinutes() - offset);

                // add new row to tempTimeGates
                var newboy = {
                    "VersionNumber": items,
                    "DateTime": ctimez
                }
                tempTimeGates.push(newboy);

                // save tempTimeGates to TimeGates.json
                var data = JSON.stringify(tempTimeGates);
                fs.writeFileSync(babadata.datalocation + "TimeGates.json", data);

                if (babadata.testing === undefined)
                {
                    // update db with newboy
                    con.query(`INSERT INTO timegates (VersionNumber, DateTime) VALUES ("${items}", "${newboy.DateTime.toISOString().slice(0, 19).replace('T', ' ')}")`, 
                    function (err, result)
                    {
                        if (err)
                        {
                            if (validErrorCodes(err.code))
                            {
                                EnterDisabledMode(err);
                                return;
                            }
                            else
                                dbErrored(err)
                        }
                    });
                }
                resolve("SuccCess, Changes Detected");
            }
            else
            {
                resolve("SuccCess, No Changes Detected");
            }
        })
        .catch((err) => {reject(err)});
    });

    return PromisedFriday;
}

/**
 * Loads Friday content version history from database to cache file
 *
 * Queries timegates table for version numbers and timestamps of all Friday
 * content updates. Used for tracking when Friday phrases/loops changed.
 *
 * SQL: Select * from timegates
 *
 * Side effects:
 * - Writes to TimeGates.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "TimeGates" on database error
 */
function LoadTimeGatesCache()
{
    var PromisedTimeGates = new Promise((resolve, reject) =>
    {
        var query = `Select * from timegates`;
        var jsonLocation = babadata.datalocation + "TimeGates.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];

			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];

				var ctimez = new Date(res.DateTime);
				var offset = ctimez.getTimezoneOffset();
				ctimez.setMinutes(ctimez.getMinutes() - offset);

				var resj = 
				{
					"VersionNumber": res.VersionNumber,
					"DateTime": ctimez,
				}

				opts.push(resj);
			}
            
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("TimeGates")});
    });

    return PromisedTimeGates;
}

/**
 * Loads Slash Friday phrases from database to cache file
 *
 * Queries dowfunny table joined with fridaytimegates for main Friday content.
 * Each entry contains text, heading levels, enabled status, user overrides,
 * and time-based availability (day of week, time ranges, occurrence chances).
 *
 * SQL: SELECT * FROM dowfunny left join fridaytimegates on dowfunny.UID = fridaytimegates.fUID
 *
 * Side effects:
 * - Writes to DOWcache.json
 *
 * @returns {Promise<Object[]>} Array of Friday phrase objects
 * @throws {string} "DOWCache" on database error
 */
function LoadFridayCache()
{
    var PromisedFriday = new Promise((resolve, reject) =>
    {
        var query = `SELECT * FROM dowfunny left join fridaytimegates on dowfunny.UID = fridaytimegates.fUID`;
        var jsonLocation = babadata.datalocation + "DOWcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				text = res.text;
				if (res.text2 != null)
				{
					text += " " + res.text2;
				}

				var resj = 
				{
					"UID": res.UID,
					"text": text,
					"enabledDef": res.enabled,
					"IDS": res.overideIDs,
					"h1": res.h1,
					"h2": res.h2,
					"h3": res.h3,
					"Occurance": 100,

					"StartTime": res.StartTime,
					"EndTime": res.EndTime,
					"DayOfWeek": res.DayOfWeek,
					"OccuranceChance": res.OccuranceChance == null ? 100 : res.OccuranceChance,
				}

				opts.push(resj);
			}

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve(opts);
        })
        .catch((err) => {reject("DOWCache")});
    });

    return PromisedFriday;
}

/**
 * Loads Friday control permissions from database to cache file
 *
 * Queries dowcontrol table for user/channel permission levels controlling
 * who can see Friday content and at what intensity.
 *
 * SQL: Select * from dowcontrol
 *
 * Side effects:
 * - Writes to DOWcontrol.json
 *
 * @returns {Promise<Object[]>} Array of control setting objects
 * @throws {string} "DOWControl" on database error
 */
function LoadFridayControlCache()
{
    var PromisedFridayControl = new Promise((resolve, reject) =>
    {
        var query = `Select * from dowcontrol`;
        var jsonLocation = babadata.datalocation + "DOWcontrol.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];

				var resj = 
				{
					"ID": res.IDDOWControl,
					"Control": res.controlLevel
				}

				opts.push(resj);
			}
            
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve(opts);
        })
        .catch((err) => {reject("DOWControl")});
    });

    return PromisedFridayControl;
}

/**
 * Loads Friday nested loop replacements from database to cache file
 *
 * Queries fridaynestedloops table for text substitution groups used in Friday
 * messages. Groups replaceable text by weight for weighted random selection.
 * Processes weights to create proper random distribution (e.g., weight 2 = included twice).
 *
 * SQL: Select * from fridaynestedloops
 *
 * Side effects:
 * - Writes to FridayLoops.json
 *
 * @returns {Promise<Object>} Object with group names as keys, arrays of weighted text as values
 * @throws {string} "FridayLoops" on database error
 */
function LoadFridayLoopsCache()
{
    var PromisedFridayLoops = new Promise((resolve, reject) =>
    {
        var query = `Select * from fridaynestedloops`;
        var jsonLocation = babadata.datalocation + "FridayLoops.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				text = res.text;
				var resj = 
				{
					"UID": res.UID,
					"text": text,
					"group": res.group,
					"weight": res.weight,
				}

				opts.push(resj);
			}

			// var data = JSON.stringify(opts);

			// fs.writeFileSync(babadata.datalocation + "FridayLoops.json", data);
			// let rawloops = fs.readFileSync(babadata.datalocation + "FridayLoops.json");

			var fridLoops = opts
		
			var replacements = {};
			var replacementsWeights = {};
			for (var i = 0; i < fridLoops.length; i++)
			{
				if (replacements[fridLoops[i].group] == null)
				{
					replacements[fridLoops[i].group] = [];
					replacementsWeights[fridLoops[i].group] = {"min": 1}
				}
		
				if (fridLoops[i].weight < replacementsWeights[fridLoops[i].group].min)
					replacementsWeights[fridLoops[i].group].min = fridLoops[i].weight;
		
			}
			
			for (var i = 0; i < fridLoops.length; i++)
			{
				gWeight = replacementsWeights[fridLoops[i].group].min;
				insertCount = gWeight == 1 ? fridLoops[i].weight : Math.floor((1 / gWeight) * fridLoops[i].weight);
		
				for (var j = 0; j < insertCount; j++)
					replacements[fridLoops[i].group].push({"text": fridLoops[i].text, "UID": fridLoops[i].UID});
			}

			//save to a json file -- testing dont delete shane like you love to delete these things, i saw what you did that one time
			var data = JSON.stringify(replacements);

            fs.writeFileSync(jsonLocation, data);
            resolve(replacements);
        })
        .catch((err) => {reject("FridayLoops")});
    });

    return PromisedFridayLoops;
}

/**
 * Loads holiday/special event data from database to cache file
 *
 * Queries event table joined with alteventnames for holidays, birthdays, and
 * special occasions. Includes event names, dates (fixed or relative), and frog
 * association for Baba Wednesday feature.
 *
 * SQL: SELECT * FROM event left join alteventnames on event.EventID = alteventnames.EventID
 *
 * Side effects:
 * - Writes to HolidayFrogs.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Holidays" on database error
 */
function LoadHolidaysCache()
{
    var PromisedHolidays = new Promise((resolve, reject) =>
    {
        var query = `SELECT * FROM event left join alteventnames on event.EventID = alteventnames.EventID`;
        var jsonLocation = babadata.datalocation + "HolidayFrogs.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                var resj = 
                {
                    "EventRealName": res.EventRealName,
                    "EventFrogName": res.EventFrogName,
                    "Mode": res.Mode,
                    "Day": res.Day,
                    "Month": res.Month,
                    "DOW": res.DOW,
                    "Week": res.Week,
                    "EventName": res.EventName,
                    "ParentEventID": res.ParentEventID,
                    "EventID": res.EventID,
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Holidays")});
    });

    return PromisedHolidays;
}

/**
 * Loads detected haikus from database to cache file
 *
 * Queries haiku table joined with user and channel data for all haikus ever
 * detected in messages. Includes raw text, formatted version, accidental flag,
 * timestamp, message URL, author, and channel.
 *
 * SQL: SELECT * FROM haiku Left Join userval... Left Join channelval...
 *
 * Side effects:
 * - Writes to HaikusCache.json
 *
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Haikus" on database error
 */
function LoadHaikusCache()
{
    var PromisedHaikus = new Promise((resolve, reject) =>
    {
        var query = `SELECT * FROM haiku
                     Left Join userval on haiku.PersonName = userval.PersonName
                     Left Join channelval on haiku.ChannelID = channelval.ChannelID`;
        var jsonLocation = babadata.datalocation + "HaikusCache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                var resj = 
                {
                    "PersonName": res.PersonName,

                    "DiscordID": res.DiscordID,
                    "DiscordName": res.DiscordName,

                    "Haiku": res.Haiku,
                    "HaikuFormatted": res.HaikuFormatted,

                    "Accidental": res.Accidental,

                    "Date": res.Date,
                    "URL": res.URL,

                    "ChannelID": res.ChannelID,
                    "ChannelName": res.ChannelName,
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Haikus")});
    });

    return PromisedHaikus;
}

/**
 * Updates control level for DOW or FROG features
 *
 * Generic function to set permission level for user/channel in control tables.
 * After updating, reloads relevant cache to apply changes immediately.
 *
 * SQL: Select from [dow|frog]control, then INSERT or UPDATE
 *
 * Side effects:
 * - Inserts or updates record in dowcontrol or frogcontrol table
 * - Triggers LoadAllSlashFridayStuff or LoadFrogCache to refresh cache
 *
 * @param {string} id - User or channel ID
 * @param {string} level - Control level value
 * @param {string} prefix - "DOW" for Friday or "FROG" for Wednesday frogs
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "[dow|frog]Control" on database error
 */
function controlDOW(id, level, prefix)
{
	var lcx = prefix.toLowerCase();
    var PromisedControlDOW = new Promise((resolve, reject) =>
    {
        var query = `Select * from ${lcx}control where ID${prefix}Control = "${id}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.length == 0)
                query = `INSERT INTO ${lcx}control (ID${prefix}Control, controlLevel) VALUES ("${id}", "${level}")`;
            else
                query = `UPDATE ${lcx}control Set controlLevel = "${level}" WHERE ID${prefix}Control = "${id}"`;

            callSQLQuery(query)
            .then((result) =>
            {
                if (prefix == "DOW")
                {
                    LoadAllSlashFridayStuff();
                }
                else if (prefix == "FROG")
                {
                    LoadFrogCache();
                }
                resolve("SuccCess");
            }) 
            .catch((err) => {reject(lcx + "Control")});
        })
        .catch((err) => {reject(lcx + "Control")});
    });

    return PromisedControlDOW;
}

// ============================================
// Emoji Helper Functions
// ============================================

/**
 * Finds emoji object by name in grouped emoji list
 *
 * Helper for groupEmojiByTones to locate emoji entries by name during
 * skin tone variant grouping.
 *
 * @param {Object[]} emojiList - Array of emoji objects
 * @param {string} emojiName - Emoji name to search for
 * @returns {Object|null} Emoji object if found, null otherwise
 */
function getGroupedEmoji(emojiList, emojiName)
{
    for (var i = 0; i < emojiList.length; i++)
    {
        var emoji = emojiList[i];
        if (emoji.name == emojiName)
        {
            return emoji;
        }
    }

    return null;
}

/**
 * Groups emoji variants with skin tones under base emoji
 *
 * Processes emoji list to consolidate skin tone variants under their base emoji.
 * For example, all "thumbs up" skin tone variants are grouped under base "thumbs up".
 * Removes skin tone suffix from name and adds variant to parent's emojis array.
 *
 * Skin tone patterns removed:
 * - "light skin tone"
 * - "medium-light skin tone"
 * - "medium skin tone"
 * - "medium-dark skin tone"
 * - "dark skin tone"
 *
 * @param {Object} emojiList - Emoji list object with emojis array
 * @returns {Object[]} Grouped emoji array with skin tone variants nested
 */
function groupEmojiByTones(emojiList)
{
    var list = emojiList.emojis;
    var grouped = [];
    for (var i = 0; i < list.length; i++)
    {
        var emoji = list[i];
        var eName = emoji.name;
        emoji.emojis = [];
        emoji.emojis.push(emoji.emoji);

		if (eName.includes("skin tone"))
        {
            var enameSplit = "";
            // split the name by "light", "medium", "dark", "mediumdark", "mediumlight"
            enameSplit = eName.replace("medium-dark skin tone", "")
            .replace("medium-light skin tone", "")
            .replace("light skin tone", "")
            .replace("medium skin tone", "")
            .replace("dark skin tone", "")
            .replace(" , ", " ");

            // remove trailing : or ,
            enameSplit = enameSplit.replace(/[:,\s]+$/, "");

            // trim
            enameSplit = enameSplit.trim();

            var parent = getGroupedEmoji(list, enameSplit);
            if (parent != null)
                parent.emojis.push(emoji.emoji);
            else
            {
                if (enameSplit != "")
                {
                    console.log("Parent not found: " + enameSplit);
                    emoji.name = enameSplit;
                    grouped.push(emoji);
                }
            }
        }
        else
        {
            var parent = getGroupedEmoji(grouped, eName); // check if already in list
            if (parent != null)
                parent.emojis.push(emoji.emoji);
            else
                grouped.push(emoji);
        }
    }

    return grouped;
}

// ============================================
// Hurricane Tracking Functions
// ============================================

/**
 * Saves updated hurricane data from JSON cache to database
 *
 * Reads hurricanes.json and writes any hurricanes marked as Updated=true to
 * database. Uses INSERT...ON DUPLICATE KEY UPDATE to handle both new and
 * existing hurricanes.
 *
 * SQL: Insert into hurricane (...) ON DUPLICATE KEY UPDATE name = ..., type = ..., category = ..., lastupdated = ...
 *
 * Side effects:
 * - Inserts or updates records in hurricane table
 * - Sets Updated flag to false after saving
 *
 * @returns {Promise<void>} Resolves when all updates saved
 */
async function saveUpdatedHurrInfo()
{
	return new Promise((resolve, reject) => 
	{
		if(!fs.existsSync(babadata.datalocation + '/hurricanes.json')) 
		{
			fs.writeFileSync(babadata.datalocation + '/hurricanes.json', JSON.stringify([]));
		}
	
		var data = fs.readFileSync(babadata.datalocation + "hurricanes.json");
		var hurrInfo = JSON.parse(data);
	
		for (var i = 0; i < hurrInfo.length; i++)
		{
			if (hurrInfo[i].Updated)
			{
				// update all the info
				var id = hurrInfo[i].ID;
				var name = hurrInfo[i].Name;
				var number = hurrInfo[i].Number;
				var type = hurrInfo[i].Type;
				var category = hurrInfo[i].Category;
				var imgURL = hurrInfo[i].ImageURL;
				var xmlURL = hurrInfo[i].XMLURL;
				var year = hurrInfo[i].Year;
				var lastUpdated = hurrInfo[i].LastUpdated;
	
				// insert into database, if it already exists, update it
				con.query(`Insert into hurricane (id, name, number, type, category, imageURL, XMLUrl, Year, lastupdated) VALUES ("${id}", "${name}", "${number}", "${type}", "${category}", "${imgURL}", "${xmlURL}", "${year}", "${lastUpdated}") ON DUPLICATE KEY UPDATE name = "${name}", type = "${type}", category = "${category}", lastupdated = "${lastUpdated}"`,
				function (err, result)
				{
					if (err)
					{
						if (validErrorCodes(err.code))
						{
							EnterDisabledMode(err);
							return;
						}
						else
							dbErrored(err)
					}
				});
	
				hurrInfo[i].Updated = false;
			}
		}

		resolve();
	});
}

/**
 * Retrieves current year hurricane data from database
 *
 * First saves any pending updates via saveUpdatedHurrInfo, then queries
 * hurricane table for current year's hurricanes. Filters to current year only
 * and adjusts timestamps for timezone.
 *
 * SQL: Select * from hurricane
 *
 * Side effects:
 * - Calls saveUpdatedHurrInfo to persist pending changes
 * - Writes filtered results to hurricanes.json
 *
 * @returns {Promise<void>} Resolves after hurricane data refreshed
 */
async function getHurricaneInfo()
{
	return new Promise((resolve, reject) =>
	{
		// wait for saveUpdatedHurrInfo to finish
		saveUpdatedHurrInfo().then(() =>
		{
			con.query(`Select * from hurricane`,
			function (err, result)
				{
					var opts = [];
					if (err)
					{
						if (validErrorCodes(err.code))
						{
							EnterDisabledMode(err);
							return;
						}
						else
							dbErrored(err)
					}
		
					for (var i = 0; i < result.length; i++)
					{
						var res = result[i];
		
						if (res.Year != getD1().getFullYear())
							continue;
						
						// convert lastupdated to current timezone
						var ctimez = new Date(res.LastUpdated);
						var offset = ctimez.getTimezoneOffset();
						ctimez.setMinutes(ctimez.getMinutes() - offset);

						var resj = 
						{
							"ID": res.id,
							"LastUpdated": ctimez,
							"Name": res.name,
							"Number": res.number,
							"Type": res.type,
							"Category": res.category,
							"ImageURL": res.imageURL,
							"XMLURL": res.XMLUrl,
							"Year": res.Year,
							"Updated": false,
							"OverideText": null
						}

		
						opts.push(resj);
					}
		
					var data = JSON.stringify(opts);
		
					fs.writeFileSync(babadata.datalocation + "hurricanes.json", data);
				
					resolve();
				}
			);
		});
	});
}

// ============================================
// Reminder Database Functions
// ============================================

/**
 * Adds new reminder to database
 *
 * Inserts reminder record with source channel, message content, files, target
 * date/time, and user preferences. Testing flag determines which bot environment
 * the reminder belongs to.
 *
 * SQL: Insert into reminders (Source, Message, UserID, Files, Date, ChannelID, ThreadParentID, EnabledAtPerson, ID, Testing) VALUES (...)
 *
 * Side effects:
 * - Inserts record in reminders table
 *
 * @param {Object} reminderItem - Reminder object with properties: Source, Message, UserID, Files, Date, ChannelID, ThreadParentID, EnableAtPerson, ID
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Reminder Add" on database error
 */
function AddReminderToDB(reminderItem)
{
    var fileString = "";
    if (reminderItem.Files != null)
    {
        for (var i = 0; i < reminderItem.Files.length; i++)
        {
            fileString += reminderItem.Files[i] + ",";
        }
    }

    var dtsrart = new Date(reminderItem.Date).toISOString().slice(0, 19).replace('T', ' ');

    return new Promise((resolve, reject) =>
    {
        var testIndex = babadata.testing === undefined ? false : true;
        var threadParentID = reminderItem.ThreadParentID == "null" ? null : reminderItem.ThreadParentID;

        var query = `Insert into reminders (Source, Message, UserID, Files, Date, ChannelID, ThreadParentID, EnabledAtPerson, ID, Testing) VALUES ("${reminderItem.Source}", "${reminderItem.Message}", "${reminderItem.UserID}", "${fileString}", "${dtsrart}", "${reminderItem.ChannelID}", "${threadParentID}", ${reminderItem.EnableAtPerson}, "${reminderItem.ID}", ${testIndex})`;
        callSQLQuery(query)
        .then(() => 
        {
            resolve("SuccCess");
        })
        .catch((err) => {reject("Reminder Add")});
    });
}

/**
 * Updates existing reminder in database
 *
 * Modifies all fields of reminder record identified by ID. Used when user
 * reschedules or modifies reminder content.
 *
 * SQL: Update reminders Set Source = ..., Message = ..., Files = ..., Date = ..., ChannelID = ..., ThreadParentID = ..., EnabledAtPerson = ... WHERE ID = ...
 *
 * Side effects:
 * - Updates record in reminders table
 *
 * @param {Object} reminderItem - Reminder object with all properties including ID
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Reminder Edit" on database error
 */
function EditReminderInDB(reminderItem)
{
    var fileString = "";
    if (reminderItem.Files != null)
    {
        for (var i = 0; i < reminderItem.Files.length; i++)
        {
            fileString += reminderItem.Files[i] + ",";
        }
    }

    var dtsrart = new Date(reminderItem.Date).toISOString().slice(0, 19).replace('T', ' ');

    return new Promise((resolve, reject) =>
    {
        var threadParentID = reminderItem.ThreadParentID == "null" ? null : reminderItem.ThreadParentID;

        var query = `Update reminders Set Source = "${reminderItem.Source}", Message = "${reminderItem.Message}", Files = "${fileString}", Date = "${dtsrart}", ChannelID = "${reminderItem.ChannelID}", ThreadParentID = "${threadParentID}", EnabledAtPerson = ${reminderItem.EnableAtPerson} WHERE ID = "${reminderItem.ID}"`;
        callSQLQuery(query)
        .then(() =>
        {
            resolve("SuccCess");
        })
        .catch((err) => {reject("Reminder Edit")});
    });
}

/**
 * Deletes reminder from database
 *
 * Removes reminder record by ID when user cancels or after reminder fires.
 *
 * SQL: Delete from reminders WHERE ID = ...
 *
 * Side effects:
 * - Deletes record from reminders table
 *
 * @param {Object} reminderItem - Reminder object containing at minimum the ID property
 * @returns {Promise<string>} "SuccCess" on completion
 * @throws {string} "Reminder Delete" on database error
 */
function DeleteReminderInDB(reminderItem)
{
    return new Promise((resolve, reject) =>
    {
        var query = `Delete from reminders WHERE ID = "${reminderItem.ID}"`;
        callSQLQuery(query)
        .then(() =>
        {
            resolve("SuccCess");
        })
        .catch((err) => {reject("Reminder Delete")});
    });
}

// Cleanup Functions  ------------------------------------------------------------------------------------------------------------------------------------------------

var cleanupFn = function cleanup() 
{
	if ((global.dbAccess[1] && global.dbAccess[0]))
	{
        try 
        {
            con.end();
            console.log("Ending SQL Connection");
            con = null;
        }
        catch (err)
        {
            con = null;
        }
	}

	if (timeoutClear != null)
	{
		console.log("Clearing Timeout - VCC Updater");
		clearTimeout(timeoutClear);
	}
	if (timeoutDisconnect != null)
	{
		console.log("Clearing Timeout - DB Auto Disconnect");
		clearTimeout(timeoutDisconnect);
	}
	if (timeoutFix != null)
	{
		console.log("Clearing Timeout - DB Down Checker");
		clearTimeout(timeoutFix);
	}
}

process.on('SIGINT', cleanupFn);
process.on('SIGTERM', cleanupFn);

global.DBVoiceCleanup = cleanupFn;

module.exports = {
    LoadAllTheCache,
    controlDOW,
    SaveSlashFridayJson,
    EventDB,
    voiceChannelChange,

    NameFromUserIDID,
    PickThePerfectUsername,
    
    clearVCCList,
    optOut,
    optIn,

    getHurricaneInfo,
    saveUpdatedHurrInfo,

    DMMePlease,

    LoadReminderCache,
    AddReminderToDB,
    EditReminderInDB,
    DeleteReminderInDB
}