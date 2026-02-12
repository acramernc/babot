/**
 * @fileoverview Basic Helper Functions for Baba Discord Bot
 *
 * Comprehensive utility library providing 100+ functions across multiple domains:
 *
 * Categories:
 * - Date/Time Utilities: Holiday calculations, date parsing, Easter algorithm, time string parsing
 * - Holiday Channel Management: Seasonal theme automation (Halloween, Thanksgiving, Christmas, New Year)
 * - String Formatting: Message splitting, Unicode font conversion, progress bars
 * - Discord User Management: Role assignment, timeouts, member operations
 * - Discord API Utilities: Channel status updates, authenticated requests, voice channel operations
 * - Discord Builders: Button pagination, embed navigation, modal creation
 * - File Operations: Attachment handling, API request execution from config files
 * - Easter Eggs & Reactions: Automatic emoji reactions, trigger-based responses, fish system
 * - Natural Language Processing: Time parsing with modifiers (tonight, tomorrow morning, etc.)
 * - Emoji Systems: Intelligent emoji matching, extreme emoji mode for events
 * - Database Helpers: Frog ID checking, various cache file operations
 * - Audit Log Utilities: Discord event type enum conversion
 *
 * Key Features:
 * - Automatic holiday channel theming based on calendar dates
 * - Complex natural language time parsing ("tomorrow afternoon", "later tonight")
 * - Smart emoji reaction system with category-based selection
 * - "Please" response system with customizable probability distributions
 * - Fish Easter egg with weighted random selection
 * - Button-based pagination with modal jump-to-page
 * - Message splitting for Discord's 2000 character limit
 * - Unicode fancy font converter with 12+ font styles
 *
 * @module basicHelpers
 * @requires ../../babotdata.json
 * @requires fs
 * @requires https
 * @requires node-fetch
 * @requires discord.js
 * @requires ../../Tools/overrides
 * @requires ./slashFridayHelpers
 */

var babadata = require('../../babotdata.json'); //baba configuration file

const fs = require('fs');
const https = require('https')
const fetch = require('node-fetch');

const Discord = require('discord.js'); //discord module for interation with discord api
const { PermissionsBitField } = require('discord.js');
const { ModalBuilder, ActionRowBuilder, TextInputBuilder } = require('discord.js');
const { ComponentType } = require('discord.js');

const { getD1 } = require('../../Tools/overrides');
const { resetRNG, functionPostFunnyDOW } = require('./slashFridayHelpers');

const validLetters = "bikusfrday";

const options = { year: 'numeric', month: 'long', day: 'numeric' }; // for date parsing to string

// ============================================
// Date and Time Utilities
// ============================================

/**
 * Parses a message to extract date information (month, day, year)
 *
 * Processes natural language date strings by:
 * - Removing common words like "wednesday", "days", "until", "next"
 * - Extracting month names (partial matches supported, e.g., "jan" matches "january")
 * - Parsing day (1-31) and year values
 * - Validating day limits for months (29 for Feb, 30 for Apr/Jun/Sep/Nov)
 * - Defaulting to current year if year not provided
 *
 * @param {string} message - The message text to parse for date information
 * @param {boolean} [haiku=false] - If true, allows partial dates (month/day/year can be 0)
 * @returns {Object|null} Date object with properties {name: "date", mode: 5, day, month, year} or null if invalid
 *
 * @example
 * FindDate("!baba wednesday until january 15 2026") // Returns {name: "date", mode: 5, day: 15, month: 1, year: 2026}
 * FindDate("next april 20") // Returns {name: "date", mode: 5, day: 20, month: 4, year: 2026}
 */
function FindDate(message, haiku = false) //Not Thanks to Jeremy's Link
{
	var outps = message.toLowerCase().replace("!baba", "") //there is no point to this, i did it because i wanted too
		.replace("wednesday", "")
		.replace("days", "")
		.replace("until", "")
		.replace("next", "")
		.split(" ");

	var day = 0;
	var month = 0;
	var year = 0;

	for ( var i = 0; i < outps.length; i++)  //loop all the text
	{
		var item = outps[i];
		if (month == 0) //set month to a detected month
		{
			if (item == "")
				month = 0;
			else if ("january".includes(item))
				month = 1;
			else if ("february".includes(item))
				month = 2;
			else if ("march".includes(item))
				month = 3;
			else if ("april".includes(item))
				month = 4;
			else if ("may".includes(item))
				month = 5;
			else if ("june".includes(item))
				month = 6;
			else if ("july".includes(item))
				month = 7;
			else if ("august".includes(item))
				month = 8;
			else if ("september".includes(item))
				month = 9;
			else if ("october".includes(item))
				month = 10;
			else if ("november".includes(item))
				month = 11;
			else if ("december".includes(item))
				month = 12;
		}

		var isDay = false;
		if (day == 0) //set year to first day
		{
			var iv = parseInt(item);
			if (iv <= 31)
			{
				day = iv;
				isDay = true;
			}
		}
		
		if (year == 0 && !isDay) //set year to first year found
		{
			var iv = parseInt(item);
			if (!isNaN(iv) && iv >= 0)
			{
				if (iv < 100)
					year = iv + 2000;
				else
					year = iv;
			}
		}
	}

	// Day limit validation by month
	// Format: [maxDays, month1, month2, ...]
	// February has 29 days (accounts for leap years), Apr/Jun/Sep/Nov have 30 days
	var months = [ //Another lookup table - Hank likes these :)
		[29, 2],              // February: 29 days max
		[30, 4, 6, 9, 11]     // April, June, September, November: 30 days max
	]

	// Validate day doesn't exceed month limits (prevents invalid dates like February 31)
	for ( var i = 0; i < months.length; i++)
	{
		var limit = months[i][0]; // Maximum days for this group
		for ( var j = 1; j < months[i].length; j++)
		{
			if (months[i][j] == month) // Check if current month is in this group
			{
				if (day > limit)
					return null; // Invalid: day exceeds month limit
			}
		}
	}
	if (month == 0 && !haiku)
		return null;

	if (day == 0 && !haiku)
		return null;

	if (year == 0 && !haiku)
		year = getD1().getFullYear();

	var item = {};
	item.name = "date"; //picture lookup value
	item.mode = 5; //date calc value

	item.day = day;
	item.month = month;
	item.year = year;
	
	return item;
}

/**
 * Manages seasonal holiday channel updates based on current date
 *
 * Automatically transitions holiday channel themes throughout the year:
 * - October (month 9): Sets to "spook" theme
 * - November (month 10): Sets to "thanks" theme on/after Thanksgiving (4th Thursday)
 * - November post-Thanksgiving: Sets to "crimbo" theme
 * - December 1-25: Maintains "crimbo" theme
 * - December 26+: Sets to "defeat" (New Year) theme
 *
 * Also schedules channel description update to progress bar at midnight (00:00-00:03).
 *
 * @param {Guild} guild - Discord guild object for channel management
 * @param {Date} d1 - Current date to check for holiday transitions
 */
function MonthsPlus(guild, d1)
{
	var yr = d1.getFullYear();

	// October (month 9 in 0-indexed): Halloween theme
	if (d1.getMonth() == 9 && babadata.holidayval != "spook")
	{
		SetHolidayChan(guild, "spook");
	}
	// November (month 10): Complex Thanksgiving → Christmas transition
	else if (d1.getMonth() == 10)
	{
		// Calculate Thanksgiving: 4th Thursday of November
		var hi = {};
		hi.dayofweek = 4;   // Thursday (0=Sunday, 4=Thursday)
		hi.week = 4;        // 4th week
		hi.mode = 1;        // Mode 1 = Nth weekday of month
		hi.month = 11;      // November

		// Get Thanksgiving date for this year relative to current date
		var tgday = GetDate(d1, yr, hi);

		// Get Thanksgiving date for this year always (from Nov 1st reference)
		var d0 = new Date(yr, 10, 1);
		var tgdayThisYearAlways = GetDate(d0, yr, hi);

		var tday = getD1().getDate();

		// Before Thanksgiving: Set to "thanks" theme
		if (tgday.getFullYear() == yr && babadata.holidayval != "thanks")
		{
			SetHolidayChan(guild, "thanks");
		}
		// After Thanksgiving: Transition to Christmas "crimbo" theme
		else if (tgdayThisYearAlways.getDate() < tday)
		{
			if (babadata.holidayval != "crimbo")
			{
				SetHolidayChan(guild, "crimbo");
			}
		}
	}

	// December (month 11): Christmas → New Year transition
	if (d1.getMonth() == 11)
	{
		// Dec 1-25: Christmas theme
		if (d1.getDate() <= 25 && babadata.holidayval != "crimbo")
			SetHolidayChan(guild, "crimbo");
		// Dec 26+: New Year's "defeat" theme (defeat the old year)
		else if (babadata.holidayval != "defeat" && d1.getDate() > 25)
			SetHolidayChan(guild, "defeat");
	}

	var dnow = getD1(true);
	// Update channel description with year progress bar at midnight (00:00-00:03)
	// Delayed 15 minutes to avoid rate limit conflicts with other midnight tasks
	if (dnow.getHours() == 0 && dnow.getMinutes() < 3)
	{
		console.log("Setting Holiday Channel Description to Progress");
		setTimeout(function() {setChannelDescriptionToProgress(guild, dnow);}, 1000 * 60 * 15);
	}
}

/**
 * Updates the holiday channel description with a year progress bar
 *
 * Sets the channel topic to display "Holidays Brought to you by Baba!" followed
 * by a visual progress bar showing how much of the year has elapsed.
 *
 * @param {Guild} guild - Discord guild object
 * @param {Date} d1 - Current date for progress calculation
 */
function setChannelDescriptionToProgress(guild, d1)
{
	if (guild != null && babadata.holidaychan != "0")
	{
		guild.channels.fetch(babadata.holidaychan).then(channels => {
			var holidaychan = channels;

			if (holidaychan != null)
			{
				holidaychan.setTopic("Holidays Brought to you by Baba!\n" + progressSimple(20));
			}
		});
	}
}

/**
 * Calculates the actual date for a holiday based on its definition and year
 *
 * Supports multiple holiday calculation modes:
 * - Mode 0: Fixed date (month/day/year)
 * - Mode 1: Nth weekday of month (e.g., 4th Thursday of November for Thanksgiving)
 * - Mode 2: First occurrence of specific weekday after given day in remaining months
 * - Mode 3: Easter Sunday (uses Easter calculation algorithm)
 * - Mode 5: Custom date with year override handling
 *
 * Automatically advances to next year if calculated date has already passed.
 * Validates dates and returns far-future date (year 200000) for invalid dates.
 *
 * @param {Date} d1 - Reference date (usually current date)
 * @param {number} yr - Year to calculate holiday for
 * @param {Object} holidayinfo - Holiday definition object with properties:
 *   - {number} mode - Calculation mode (0-5)
 *   - {number} month - Month (1-12)
 *   - {number} day - Day of month or specific day depending on mode
 *   - {number} [dayofweek] - Day of week (0=Sunday, 6=Saturday) for modes 1-2
 *   - {number} [week] - Week number for mode 1 (negative counts from end)
 *   - {string} name - Holiday name (sets safename for display)
 * @returns {Date} Calculated holiday date
 */
function GetDate(d1, yr, holidayinfo) //Gets the specified date from the selected holiday at the year provided
{
	let d2 = getD1(); //new Date
	switch(holidayinfo.mode)
	{
		case 5:
			if (holidayinfo.year)
			{
				yr = holidayinfo.year;
                var tempDate = new Date(yr, holidayinfo.month - 1, holidayinfo.day);
				if (tempDate < d1)
					yr--;
				holidayinfo.year = 0;
			}
		case 0:
			//console.log(yr);
			if (holidayinfo.month == 0)
				holidayinfo.month = 1;

			if (holidayinfo.day == 0)
				holidayinfo.day = 1;

			d2 = new Date(yr, holidayinfo.month - 1, holidayinfo.day); //get holiday
			break;
		case 1:
			var wk = holidayinfo.week;
			var mnth = holidayinfo.month;

			if (holidayinfo.week < 0)
			{
				wk++;
				mnth++;
			}

			d2 = new Date(yr, mnth - 1, 1); //get first of specified month
			var dtcalc = 1 + (holidayinfo.dayofweek - d2.getDay() - 7) % 7;
			if (dtcalc == 1) dtcalc = -6;

			dtcalc = dtcalc + (7 * wk); //calculate the day of the month

			d2 = new Date(yr, mnth - 1, dtcalc); //get holiday
			break;
		case 2:
			var sm = d1.getMonth() + 1; //get the month to start on
			if (d1.getDate() > holidayinfo.day) //add one month if day is past specified day
				sm++;

			let retd = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate() - 1); //set to day before today
			for (var i = sm; i <= 12; i++)
			{
				let d3 = new Date(yr, i - 1, holidayinfo.day); //get each months specified day
				if (d3.getDay() == holidayinfo.dayofweek) //check each months specified day is correct DOW
				{
					retd = d3; //set day
					break;
				}
			}
			d2 = retd;
			break;
		case 3:
			var ea = getEaster(yr); //get easter
			d2 = new Date(yr, ea[0] - 1, ea[1]); //get holiday
			break;
		default:
			console.log(holidayinfo);
	}

	if (isNaN(d2))
	{
		// Need to return special value to indicate that the date is invalid such that it still displays right date
		return new Date(200000, 0, 1);
	}

	if (holidayinfo.name == "date" && holidayinfo.day != d2.getDate())
	{
		d2 = GetDate(new Date(yr + 1, 0, 1), yr + 1, holidayinfo); //re-call function w/year of next
	}
	
	// Convert d1 and d2 to midnight for accurate date comparison
	var d1Midnight = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
	var d2Midnight = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
	if (d2Midnight.getTime() < d1Midnight.getTime()) //check if day is post holiday and make next holiday year + 1
	{
		if (holidayinfo.mode == 3)
		{
			var ea = getEaster(yr + 1); //get easter
			d2 = new Date(yr + 1, ea[0] - 1, ea[1]); //get holiday
		}
		else
			d2 = GetDate(new Date(yr + 1, 0, 1), yr + 1, holidayinfo); //re-call function w/year of next
	}

	if (holidayinfo.name == "date")
		holidayinfo.safename = d2.toLocaleDateString('en-US', options); //display value

	return d2;
}

/**
 * Calculates Easter Sunday for a given year using the Anonymous Gregorian algorithm
 *
 * Uses the computus algorithm to determine Easter date:
 * - Calculates golden number, century, and various correction factors
 * - Returns month and day in Gregorian calendar
 * - Works for all years in Gregorian calendar era
 *
 * @param {number} year - Year to calculate Easter for
 * @returns {Array<number>} Array [month, day] where month is 3-4 (March-April)
 *
 * @example
 * getEaster(2026) // Returns [4, 5] for April 5, 2026
 */
function getEaster(year) //Thanks to Jeremy's Link
{
	var f = Math.floor,
		G = year % 19,
		C = f(year / 100),
		H = (C - f(C / 4) - f((8 * C + 13)/25) + 19 * G + 15) % 30,
		I = H - f(H/28) * (1 - f(29/(H + 1)) * f((21-G)/11)),
		J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7,
		L = I - J,
		month = 3 + f((L + 40)/44),
		day = L + 28 - 31 * f(month / 4);

	return [month, day];
}

// ============================================
// Holiday Channel Management
// ============================================

/**
 * Sets the holiday channel theme and manages channel state
 *
 * Performs multiple operations based on resetid:
 * - resetid = -1: Rename channel to themed name (spook/thanks/crimbo/defeat)
 * - resetid = 0: Archive channel (move to Archive category, disable sending)
 * - resetid = 3: Restore channel (move to Text Channels, enable sending)
 * - resetid > 0 (not 3): Update holidaychan ID in config
 *
 * Theme names and their display:
 * - "spook": 🎃👻💀🕸️ 𝕳𝖆𝖑𝖑𝖔𝖜𝖘 𝕰𝖛𝖊 🕸️💀👻🎃
 * - "thanks": 🌽 ᵀʰᵃⁿᵏˢᵍⁱᵛⁱⁿᵍ ⁴: ᴹⁱˢˢⁱⁿᵍ ᵀᵁᴿᴷᴱʸ 🌽
 * - "crimbo": 🎄 𓀒 匚卄尺丨丂ㄒ爪卂丂 ㄒㄩ尺ㄒㄥ乇 乇ᗪ丨ㄒ丨ㄖ几 𓀒 🎄
 * - "defeat": 🎉🚨 /🅵🆁🅸🅳🅰🆈 on J₳₦Ʉ₳ⱤɎ 1🅢ⓣ, 2️⃣0️⃣2️⃣7️⃣ 🚨🎉
 *
 * Appending "-n" to name skips the rename operation.
 * Updates babotdata.json with new holidayval and holidaychan settings.
 *
 * @param {Guild} guild - Discord guild object for channel operations
 * @param {string} name - Theme name (spook/thanks/crimbo/defeat) or channel ID when resetid=3
 * @param {number} [resetid=-1] - Operation mode (-1=rename, 0=archive, 3=restore, >0=set ID)
 */
function SetHolidayChan(guild, name, resetid = -1)
{
	console.log("SetHolidayChan: " + name + " " + resetid);

	let to = 0;
	var dirni = __dirname.replace("Functions/HelperFunctions", "").replace("Functions\\HelperFunctions", "");
	console.log(dirni);
	let rawdata = fs.readFileSync(dirni + '/babotdata.json');
	let baadata = JSON.parse(rawdata);

	var rename = name.indexOf("-n") <= 0;

	name = name.replace("-n", "");

	if (resetid > 0 && resetid != 3)
		baadata.holidaychan = resetid.toString();

	if (guild != null && resetid < 0)
	{
		const chanyu = guild.channels.resolve(babadata.holidaychan);
		
		if (chanyu != null && rename)
		{
			switch(name)
			{
				case "spook": //Spooky
					console.log("Spooky Time!");
					chanyu.setName("🎃👻💀🕸️ 𝕳𝖆𝖑𝖑𝖔𝖜𝖘 𝕰𝖛𝖊 🕸️💀👻🎃")
						.then((newChannel) =>
						console.log(`The channel's new name is ${newChannel.name}`),
					)
					.catch(console.error);
					break;
				case "thanks": //Thanks
					console.log("Thanksgiving Time!");
					chanyu.setName("🌽 ᵀʰᵃⁿᵏˢᵍⁱᵛⁱⁿᵍ ⁴: ᴹⁱˢˢⁱⁿᵍ ᵀᵁᴿᴷᴱʸ 🌽") //🦃
						.then((newChannel) =>
						console.log(`The channel's new name is ${newChannel.name}`),
					)
					.catch(console.error);
					break;
				case "crimbo": //Crimbo
					console.log("Crimbo Time!");
					chanyu.setName("🎄 𓀒 匚卄尺丨丂ㄒ爪卂丂  ㄒㄩ尺ㄒㄥ乇  乇ᗪ丨ㄒ丨ㄖ几 𓀒 🎄")
						.then((newChannel) =>
						console.log(`The channel's new name is ${newChannel.name}`),
					)
					.catch(console.error);
					break;
				case "defeat": //New Year
					console.log("New Year Time!");
					chanyu.setName("🎉🚨 /🅵🆁🅸🅳🅰🆈 on J₳₦Ʉ₳ⱤɎ 1🅢ⓣ, 2️⃣0️⃣2️⃣7️⃣ 🚨🎉") //🅵🆁🅸🅳🅰🆈, J₳₦Ʉ₳ⱤɎ 1🅢ⓣ, 2️⃣0️⃣2️⃣7️⃣ - change to 2027 because i found funnier one for 2026
						.then((newChannel) =>
						console.log(`The channel's new name is ${newChannel.name}`),
					)
					.catch(console.error);
					break;
				default:
					console.log(name);
			}
		}
	}
	else if (guild != null && resetid == 0)
	{
		to = 300
		guild.channels.fetch(babadata.holidaychan).then(channels => {
			var holidaychan = channels;

			if (holidaychan != null)
			{
				guild.channels.fetch().then(channels => {
					channels.each(chan => {
						if (chan.type == 4)
						{
							if (chan.name.toLowerCase() === "archive")
							{
								holidaychan.setParent(chan);
								holidaychan.permissionOverwrites.set([
									{
									  id: guild.roles.everyone,
									  deny: [PermissionsBitField.Flags.SendMessages],
									}
								  ]);
								baadata.holidaychan = "0";
							}
						}
					});
				})
			}
		});
	}
	
	
	if (guild != null && resetid == 3)
	{
		baadata.holidaychan = name;
		name = "null";
		to = 500
		guild.channels.fetch(baadata.holidaychan).then(channels => {
			var holidaychan = channels;

			if (holidaychan != null)
			{
				guild.channels.fetch().then(channels => {
					channels.each(chan => {
						if (chan.type == 4)
						{
							if (chan.name.toLowerCase() === "text channels")
							{
								holidaychan.setParent(chan);
								holidaychan.setPosition(3);
								holidaychan.permissionOverwrites.set([
									{
									  id: guild.roles.everyone,
									  allow: [PermissionsBitField.Flags.SendMessages],
									}
								  ]);
							}
						}
					});
				})
			}
		});
	}

	baadata.holidayval = name;
	setTimeout(function()
	{
		var dirni = __dirname.replace("Functions/HelperFunctions", "").replace("Functions\\HelperFunctions", "");
		fs.writeFileSync(dirni + '/babotdata.json', JSON.stringify(baadata, null, 2) + '\n', 'utf8');
	}, to)
	babadata = baadata;
}

/**
 * Generates a visual progress bar showing year completion percentage
 *
 * Creates a Unicode block progress bar with gradient transitions:
 * - █ (full block): Completed segments
 * - ▓ (dark shade): 66-100% complete in segment
 * - ▒ (medium shade): 33-66% complete in segment
 * - ░ (light shade): 0-33% complete in segment
 *
 * Calculates progress from January 1st to current date/time, accounting for leap years.
 * Special handling for end of year (last 1/12): forces full block if very close to end.
 *
 * @param {number} n - Number of segments in progress bar (typically 20)
 * @returns {string} Progress bar string with percentage (e.g., "████████▓▒░░░░░░░░░ 42.31%")
 *
 * @example
 * progressSimple(20) // Returns something like "██████░░░░░░░░░░░░░░ 30.15%"
 */
function progressSimple(n)
{
    var n1less = n - 1;

    var date2 = getD1(getHours=true);
    var date1 = new Date(date2.getFullYear(), 0, 1);

    var Difference_In_Time = date2.getTime() - date1.getTime();
    var Difference_In_Days = Difference_In_Time / (1000 * 3600 * 24);

    var leap = date2.getFullYear() % 100 === 0 ? date2.getFullYear() % 400 === 0 : date2.getFullYear() % 4 === 0;
    var endoyear = 365 + leap;
    var percent = +((Difference_In_Days / endoyear) * 100).toFixed(2);

    var pb = "";

    var vdiff = 0;
    var valcount = 0;

    for (var i = 1; i <= n1less; i++)
    {
        valcount = endoyear * (i / n);
        v1plus = endoyear * ((i+1) / n);

        var vdiff = (v1plus - valcount) / 3;

        if (Difference_In_Days < valcount)
            pb += (valcount - (2 * vdiff) > Difference_In_Days) ? "░" : ((valcount - vdiff > Difference_In_Days) ? "▒" : "▓");
        else
            pb += "█";
    }

    vdiff = (1/n * endoyear) / 3;
    valcount = endoyear * (n1less / n);

    if (Difference_In_Days > endoyear - (1/12)) pb += "█";
    else pb += (valcount + vdiff > Difference_In_Days) ? "░" : ((valcount + (2 * vdiff) > Difference_In_Days) ? "▒" : "▓");

	return pb + " " + percent + "%";
}

/**
 * Creates a new holiday channel in the specified category
 *
 * Searches for a category by name (case-insensitive) and creates a text channel:
 * - Name: "Temp Holiday Channel"
 * - Position: 3 in category
 * - Topic: Year progress bar
 * - Default reaction emoji: 🎄
 *
 * After creation, calls SetHolidayChan to configure channel ID and MonthsPlus
 * to set appropriate theme based on current date.
 *
 * @param {Guild} server - Discord guild to create channel in
 * @param {string} name - Category name to search for (e.g., "text channels")
 * @param {Date} d1 - Current date for theme determination
 * @returns {null} Always returns null
 */
function CreateChannel(server, name, d1)
{
	server.channels.fetch().then(channels => {
		channels.each(chan => {
			if (chan.type == 4)
			{
				if (chan.name.toLowerCase() === name)
				{
					const tempo1 = server.channels.create(
					{
						name: 'Temp Holiday Channel',
						type: Discord.ChannelType.GuildText,
						parent: chan,
						position: 3,
						topic: "Holidays Brought to you by Baba!\n" + progressSimple(20),
						reason: 'Baba Plase',
						defaultReactionEmoji: "🎄"
					}
					).then(result => {
						console.log('Here is channel id', result.id)
						setTimeout(function(){SetHolidayChan(server, "null", result.id)}, 200);
						setTimeout(function(){MonthsPlus(server, d1)}, 400);
					})

					return;
				}
			}
		});
	})

	return null;
}

// ============================================
// Discord User Management
// ============================================

/**
 * Adds a role to multiple users in a guild
 *
 * Iterates through a collection of users and adds the specified role to each.
 * Fetches members individually to ensure they exist in the guild before role addition.
 *
 * @param {Message} msg - Discord message object (provides guild context)
 * @param {Collection} users - Collection of user objects to add role to
 * @param {Role} role - Discord role to add to users
 * @returns {Promise<void>}
 */
async function RoleAdd(msg, users, role) //dumb user thing because it is needed to work
{
	for(let [k, uboat] of users) //iterate through all the users
	{
		msg.guild.members.fetch(uboat.id).then(mem => mem.roles.add(role)); //check if user is memeber
		//add role to user
	}
}

/**
 * Wrapper function for timing out users (legacy name)
 *
 * @param {string} u_id - User ID to timeout
 * @param {Client} bot - Discord bot client
 * @param {number} time - Timeout duration in milliseconds
 * @param {Guild} g - Discord guild object
 */
function dailyRandom(u_id, bot, time, g)
{
	maidenTime(u_id, bot, time, g);
}

/**
 * Times out a user in a Discord guild
 *
 * Fetches the user and applies a timeout with reason "Baba Plase".
 * Commonly used for moderation or Easter egg penalties.
 *
 * @param {string} u_id - User ID to timeout
 * @param {Client} bot - Discord bot client
 * @param {number} time - Timeout duration in milliseconds
 * @param {Guild} g - Discord guild object
 */
function maidenTime(u_id, bot, time, g)
{
	bot.users.fetch(u_id).then(user => {
		g.members.fetch(user).then(member => member.timeout(time, 'Baba Plase').catch(console.error));
	}).catch(console.error);
}

// ============================================
// Discord API Utilities
// ============================================

/**
 * Appends bot token to Authorization header for Discord API requests
 *
 * @param {Object} head - Headers object with Authorization field
 * @returns {Object} Modified headers object with full authorization token
 */
function cleanHead(head)
{
	head["Authorization"] += global.toke;
	return head;
}

/**
 * Updates voice channel status using Discord API
 *
 * Makes a PUT request to Discord API to set custom status for a voice channel.
 * Status is displayed in the channel for users to see.
 *
 * @param {string} channelID - Discord voice channel ID
 * @param {string} status - Status text to display (max 500 characters)
 */
function channelStatusChange(channelID, status)
{
	var url = "https://discord.com/api/v10/channels/" + channelID + "/voice-status";
	var mode = "PUT";
	var body = {
		"status": status
	};
	var heads = {
		"Authorization": "Bot ",
        "Content-Type": "application/json",
	};

	heads = cleanHead(heads);

	var vail = {
		method: mode,
	   	headers: heads,
		body: JSON.stringify(body)
	};

	fetch(url, vail).then(response => {
		var stat = response.status;
		if (stat == 200 || stat == 204)
			console.log("SUCC cess");
		else
			console.log("FAIL ure");
	});
}

// ============================================
// String Formatting and Manipulation
// ============================================

/**
 * Splits a long string into chunks that fit Discord's 2000 character message limit
 *
 * Recursively breaks strings at newline boundaries when possible:
 * - Finds last newline before 2000 character limit
 * - If no newline found, hard-breaks at 1990 characters
 * - Returns array of message-safe strings
 *
 * @param {string} vle - String to split into chunks
 * @returns {Array<string>} Array of strings, each ≤2000 characters
 *
 * @example
 * Seperated(longString) // Returns ["chunk1\n", "chunk2\n", "chunk3"]
 */
function Seperated(vle)
{
	if (vle.length > 2000)
	{
		var vleNew = vle.substring(0, 2000);
		var lindex = vleNew.lastIndexOf("\n");
		vle = vleNew.substring(lindex + 1) + vle.substring(2000);
		vleNew = vleNew.substring(0, lindex);

		if (lindex == -1)
		{
			vleNew = vle.substring(0, 1990);
			vle = vle.substring(1990);
		}

		var sgtuff = [vleNew];
		var s2 = Seperated(vle);
		sgtuff = sgtuff.concat(s2);
		return sgtuff;
	}
	else return [vle];
}

// ============================================
// File and API Operations
// ============================================

/**
 * Executes a Discord API request from a configuration file
 *
 * Process flow:
 * 1. Saves response body to local file
 * 2. Parses JSON config containing: URL (U), Method (M), Headers (H), Body (B)
 * 3. Appends user ID to URL endpoint
 * 4. Makes authenticated API request with bot token
 * 5. Sends results back to message author via DM
 * 6. Splits long responses using Seperated() to respect message limits
 *
 * @param {Message} message - Discord message for user context and replies
 * @param {string} id - User/resource ID to append to API URL
 * @param {string} local - Local file path to save response temporarily
 * @param {Response} res - Fetch response object with body to pipe
 */
function fetchMeAPirate(message, id, local, res) 
{ 
 	const dest = fs.createWriteStream(local);
 
 	res.body.pipe(dest).on('finish', () => {
 		var newfile = fs.readFileSync(local, "utf8"); 
 
 		var json = JSON.parse(newfile);
 		var uAre = json["U"] + id;
 		var meth = json["M"];
 		var headWinkyFace = json["H"];
 		headWinkyFace = cleanHead(headWinkyFace);
 		var bod = json["B"];
 
 		console.log(JSON.stringify(bod));

		var vail = {
 			method: meth,
			headers: headWinkyFace
	 	};

		if (json["B"] != null)
			vail.body = JSON.stringify(bod);
		
		fetch(uAre, vail).then(response => {
 			var stat = response.status;
 			if (stat == 200)
  				message.author.send("SUCC cess");
 			else
 				message.author.send("FAIL ure");
 
			message.author.send(stat + " " + response.statusText);
			response.text().then(text => {
				var sgtuff = Seperated(text);
				for ( var i = 0; i < sgtuff.length; i++)
					message.author.send("```" + sgtuff[i] + "```");
			});
 		})
 		.then(data => {});
 	});

}

/**
 * Checks if a user ID exists in the frog help array
 *
 * @param {Object} frogdata - Frog data object containing froghelp.ifrog array
 * @param {string} id - User ID to search for
 * @returns {number} Index of user in array, or -1 if not found
 */
function CheckFrogID(frogdata, id)
{
	for ( var i = 0; i < frogdata.froghelp.ifrog.length; i++)
	{
		if (id == frogdata.froghelp.ifrog[i])
			return i;
	}
	return -1;
}

/**
 * Calculates the number of days between two dates (DST-safe)
 *
 * Converts both dates to UTC midnight to avoid daylight saving time issues,
 * then calculates the difference in whole days.
 *
 * @param {Date} a - Start date
 * @param {Date} b - End date
 * @returns {number} Number of days from a to b (positive if b is later)
 *
 * @example
 * dateDiffInDays(new Date(2026, 0, 1), new Date(2026, 0, 15)) // Returns 14
 */
function dateDiffInDays(a, b) //helper function that does DST helping conversions
{
  const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}



/**
 * Retrieves the first attachment from a Discord message
 *
 * @param {Message} message - Discord message to extract attachment from
 * @returns {Attachment|undefined} First attachment or undefined if none exists
 */
function getAttachment(message)
{
	var file = message.attachments.first();

	if (file == null)
	{
		message.author.send("No file attached");
		return;
	}

	return file;
}

/**
 * Removes all reactions from a message
 *
 * @param {Message} message - Discord message to clear reactions from
 */
function fronge(message)
{
	message.reactions.removeAll();
}

/**
 * Processes an attached file for Discord API operations
 *
 * Extracts file attachment, fetches user ID from message content (4th word),
 * and passes to fetchMeAPirate for API execution.
 *
 * @param {Message} message - Discord message with attachment and user ID
 */
function dealWithFile(message)
{
	var file = getAttachment(message);

	var id = message.content.split(' ')[3];
	var local = babadata.temp + "local.txt";

	fetch(file.url).then(res => 
	{
		fetchMeAPirate(message, id, local, res);
	})
}

/**
 * Wrapper function for file processing (legacy name)
 *
 * @param {Message} message - Discord message to process
 */
function antiDelay(message)
{
	dealWithFile(message);
}

// ============================================
// Easter Eggs and Message Reactions
// ============================================

/**
 * Processes message content for Easter eggs and automatic reactions
 *
 * Easter egg triggers:
 * - 1/333333 chance: "The Equine Lunar God Empress demands a blood sacrifice."
 * - "perchance": Replies "# You can't just say perchance"
 * - "france is better than america": Times out user for 1 minute
 * - "wake up babe": Replies "You mean Wake up Baba!"
 * - "christmas" + "bad": Replies "# 🎅🏻🎁 Christmas is GREAT! 🎄❄️"
 * - "i request an oven at this moment": Random oven-related image/GIF
 * - April 1st (13:00+) or April 2nd: Extreme emoji reactions (up to 20)
 *
 * Also processes:
 * - Personal reactions via PersonalReact()
 * - Please checker for custom responses
 * - Archive/setstring commands for day-of-week functions
 * - Fish Easter egg checker
 *
 * @param {Message} message - Discord message object
 * @param {string} msgContent - Lowercase message content
 * @param {Client} bot - Discord bot client for user operations
 * @returns {Promise<void>}
 */
async function preformEasterEggs(message, msgContent, bot)
{
	var ames = msgContent.replace(/\s+/g, '');
	if (Math.random() * 333333 <= 1)
	{
		message.channel.send("The Equine Lunar God Empress demands a blood sacrifice.");
	}

	if(ames.includes('perchance') && !message.author.bot) //perchance update
	{
		message.reply("# You can't just say perchance");
	}

	if (msgContent.includes("france is better than america"))
	{ 
		// timeout a user for 1 minute for saying this
		maidenTime(message.author.id, bot, 1000 * 60, message.guild);
	}

	if (msgContent.includes("wake up babe"))
	{
		message.reply("You mean Wake up Baba!");
	}

	if(msgContent.includes('christmas') && msgContent.includes('bad')) //perchance update
	{
		message.reply("# 🎅🏻🎁 Christmas is GREAT! 🎄❄️");
	}

	var rct = 0;
	rct += PersonalReact(ames, message, msgContent);

	pleaseChecker(message, msgContent, ames);

	//console.log("rct: " + rct);
	var d1 = getD1(true);
	if ((d1.getMonth() === 2 && (d1.getDate() === 31 && d1.getHours() >= 13)) || (d1.getMonth() === 3 && d1.getDate() === 1))
	{
		var maxemoji = 20;
		extremeEmoji(message, msgContent, maxemoji - rct);
	}

	if (msgContent.includes("i request an oven at this moment"))
	{
		var ovenitems = ["https://tenor.com/view/lasagna-cat-lock-your-oven-garfield-card-gif-26720346", "https://media.discordapp.net/attachments/561209488724459531/1062888125073989742/091.png"]
		message.reply(ovenitems[Math.floor(Math.random() * ovenitems.length)]);
	}

	var dowIntIncluded = msgIncDay(msgContent);
	if (dowIntIncluded > -1 && (msgContent.includes("archive-") || msgContent.includes(`setstring-"`))) 
	{
		if (msgContent.includes("archive-"))
		{
			var outputstringdebug = "Archive DOW for " + dowIntIncluded;
			// get all text after archive- until space (ex. archive-1-BIKUSFRIDAY -> BIKUSFRIDAY or archive-2-FRFRF -> FRFRF)
			var frday = msgContent.match(/archive-([^ ]*)/)[1];
	
			var as = null;
			if (msgContent.includes("being-"))
			{
				as = msgContent.match(/being-([^ ]*)/)[1];
	
				// make sure it's a number and on error set to null
				as = parseInt(as);
				if (isNaN(as))
					as = null;
	
				if (as != null)
					outputstringdebug += " as " + as;
			}
	
			var during = null;
			if (msgContent.includes("dateof-"))
			{
				during = msgContent.match(/dateof-([^ ]*)/)[1];
	
				// make sure it's a number and on error set to null
				during = parseInt(during);
				if (isNaN(during))
					during = null;
	
				if (during != null)
					outputstringdebug += " during " + during;
			}
	
			var utod = null;
			if (msgContent.includes("usetoday"))
			{
				utod = true;
	
				outputstringdebug += " using today";
			}
	
			var udf = null;
			if (msgContent.includes("usedf"))
			{
				udf = true;
	
				outputstringdebug += " using default";
			}
			
			// split 1-XXX into [NUM, LETTERS]
			var frisplit = frday.split('-');
			var numboVersion = -1;
			if (frisplit.length == 1)
			{
				frday = frisplit[0];
				
				outputstringdebug += " " + frday;
			}
			else
			{
				numboVersion = frisplit[0];
				frday = frisplit[1];
	
				outputstringdebug += " " + numboVersion + " " + frday;
			}
	
			// convert to lowercase
			frday = frday.toLowerCase();
			// trim to only include letters in validLetters
			frday = frday.split('').filter(c => validLetters.includes(c)).join('');
	
			if (frday != null)
			{
				// convert to numbers based off index in validLetters
				var frdayInt = frday.split('').map(c => validLetters.indexOf(c));
				// convert to string with no spaces
				frday = frdayInt.join('');
	

				await functionPostFunnyDOW("message", message, dowIntIncluded, [frday, numboVersion, as, during, utod, udf], true);
	
				resetRNG();
			}
		}
		else if (msgContent.includes(`setstring-"`))
		{
			var setStringValue = message.content.match(/[sS][eE][tT][sS][tT][rR][iI][nN][gG]-"([^𓃐]*)"/)[1];
			
			await functionPostFunnyDOW("message", message, dowIntIncluded, [setStringValue], true);
		}
	}

	checkForFish(message, msgContent);
}

/**
 * Detects day-of-week name in message content
 *
 * @param {string} msgContent - Message content to check
 * @returns {number} Day of week (0=Sunday, 1=Monday, ..., 6=Saturday) or -1 if none found
 */
function msgIncDay(msgContent)
{
	if (msgContent.includes("monday"))
		return 1;
	else if (msgContent.includes("tuesday"))
		return 2;
	else if (msgContent.includes("wednesday"))
		return 3;
	else if (msgContent.includes("thursday"))
		return 4;
	else if (msgContent.includes("friday"))
		return 5;
	else if (msgContent.includes("saturday"))
		return 6;
	else if (msgContent.includes("sunday"))
		return 0;
	else
		return -1;
}

/**
 * Applies custom emoji reactions based on configured phrase triggers
 *
 * Loads REACTOcache.json and checks message for:
 * - Primary phrase matches
 * - Alternate phrase combinations (all must be present)
 * - Emoji presence in message
 * - Ignored phrase combinations (blocks reaction if present)
 * - Date range validation (StartDate to EndDate)
 *
 * Reaction behavior:
 * - 2% chance to send emoji as message (if Prompt enabled)
 * - Reacts with random emoji from ReactIDList
 * - Skips bot messages containing "indeed, [phrase] please!" (if IgnorePlease enabled)
 * - Falls back to 👍 if emoji reaction fails
 *
 * @param {string} ames - Message content with whitespace removed
 * @param {Message} message - Discord message object
 * @param {string} msgContent - Lowercase message content
 * @returns {number} Count of reactions added to message
 */
function PersonalReact(ames, message, msgContent)
{
	ames = ames.toLowerCase();
	var mesageames = message.content.toLowerCase().replace(/\s+/g, '');

	var u_reacts = JSON.parse(fs.readFileSync(babadata.datalocation + "REACTOcache.json"));

	var rct = 0;
	for (var i = 0; i < u_reacts.length; i++)
	{
		var u_react = u_reacts[i];

		var isGood = false;
		if (ames.includes(u_react.Phrase.toLowerCase()) || mesageames.includes(u_react.Phrase.toLowerCase()))
			isGood = true;
		else
		{
			for (var j = 0; j < u_react.AlternatePhrases.length; j++)
			{
				var phraseList = u_react.AlternatePhrases[j];
				// check if all phrases in the list are included in the message
				if (phraseList.every(phrase => ames.includes(phrase.toLowerCase())))
				{
					isGood = true;
					break;
				}
				if (phraseList.every(phrase => mesageames.includes(phrase.toLowerCase())))
				{
					isGood = true;
					break;
				}
			}
		}

		// check if any of the emojis are in the message
		if (!isGood && u_react.ReactIDList.some(emoji => ames.includes(emoji.toLowerCase())))
			isGood = true;

		for (var j = 0; j < u_react.IgnoredPhrases.length; j++)
		{
			var phraseList = u_react.IgnoredPhrases[j];
			// check if all phrases in the list are included in the message
			if (phraseList.every(phrase => ames.includes(phrase.toLowerCase())))
			{
				isGood = false;
				break;
			}
			if (phraseList.every(phrase => mesageames.includes(phrase.toLowerCase())))
			{
				isGood = false;
				break;
			}
		}

		var tod = getD1();

		if (new Date(u_react.StartDate) > tod || new Date(u_react.EndDate) < tod)
			isGood = false;

		if(isGood)
		{
			rct++;

			var ideeznuts = u_react.ReactIDList[Math.floor(Math.random() * u_react.ReactIDList.length)];
			
			var num = Math.floor(Math.random() * 100); //pick a random one
			if (num < 2 && u_react.Prompt)
				message.channel.send("<:TEMP:" + ideeznuts + ">");
			
			var goodtoreact = true;
			if (u_react.IgnorePlease)
				goodtoreact = (!(message.author.bot && (msgContent.includes("indeed, " + u_react.Phrase + " please!") || msgContent.includes("indeed, " + u_react.Phrase + "please!"))))
			
			if (goodtoreact)
				message.react(ideeznuts).catch(error => {
					message.react("👍").catch(error2 => {
						// console.error(error2);
					});
					// console.error(error);
				});
		}
	}

	return rct;
}

/**
 * Checks for "please" triggers and sends customized responses
 *
 * Loads Pleasedcache.json and PleasedOVERIDEcache.json to:
 * - Detect "[person name] please" or "pikus" in messages
 * - Apply user-specific overrides for custom probability distributions
 * - Generate responses with varying formats: normal, # (H1), ## (H2), ### (H3)
 * - Apply random fonts or flag emojis based on configured chances
 *
 * Response format: "Indeed, [PersonName] Please!" with variations:
 * - Normal text (DefaultNormalChance)
 * - # heading (DefaultH1Chance)
 * - ## heading (DefaultH2Chance)
 * - ### heading (DefaultH3Chance)
 * - Random Unicode font (DefaultRNGFontChance)
 * - Flag emoji font (DefaultFlagChance)
 *
 * Ignores bot messages containing "indeed, [name] please!" to prevent loops.
 *
 * @param {Message} message - Discord message object
 * @param {string} msgContent - Lowercase message content
 * @param {string} ames - Message content with whitespace removed
 */
function pleaseChecker(message, msgContent, ames)
{
	var pleasedata = fs.readFileSync(babadata.datalocation + "Pleasedcache.json");
	var pleaseOVERIDEdata = fs.readFileSync(babadata.datalocation + "PleasedOVERIDEcache.json");

	var please = JSON.parse(pleasedata);
	var pleaseOVERIDE = JSON.parse(pleaseOVERIDEdata);

	if(ames.includes("please") || ames.includes("pikus"))
	{
		for (var i = 0; i < please.length; i++)
		{
			var pleaso = please[i];
			// copy pleaso to a new object
			var newPleaso = {};
			for (var key in pleaso)
			{
				newPleaso[key] = pleaso[key];
			}

			if (ames.includes(please[i].PersonName.toLowerCase()))
			{
				if (!(message.author.bot && (msgContent.includes("indeed, " + please[i].PersonName.toLowerCase() + " please!") || msgContent.includes("indeed, " + please[i].PersonName.toLowerCase() + "please!"))))
				{
					var uid = message.author.id;
					var ovrideval = pleaseOVERIDE[please[i].PersonName];

					if (ovrideval != null)
					{
						var overideIds = ovrideval.OverideUIDs;
						overideIds = overideIds.split(", ");

						if (overideIds.includes(uid))
						{
							newPleaso.DefaultNormalChance = ovrideval.DefaultNormalChance != -1 ? ovrideval.DefaultNormalChance : pleaso.DefaultNormalChance;
							newPleaso.DefaultH1Chance = ovrideval.DefaultH1Chance != -1 ? ovrideval.DefaultH1Chance : pleaso.DefaultH1Chance;
							newPleaso.DefaultH2Chance = ovrideval.DefaultH2Chance != -1 ? ovrideval.DefaultH2Chance : pleaso.DefaultH2Chance;
							newPleaso.DefaultH3Chance = ovrideval.DefaultH3Chance != -1 ? ovrideval.DefaultH3Chance : pleaso.DefaultH3Chance;
							newPleaso.DefaultRNGFontChance = ovrideval.DefaultRNGFontChance != -1 ? ovrideval.DefaultRNGFontChance : pleaso.DefaultRNGFontChance;
							newPleaso.DefaultFlagChance = ovrideval.DefaultFlagChance != -1 ? ovrideval.DefaultFlagChance : pleaso.DefaultFlagChance;
						}
					}
					
					var stringDefault = "Indeed, " + please[i].PersonName + " Please!";
					
					var pleaselist = [];
					for (var j = 0; j < newPleaso.DefaultNormalChance; j++)
						pleaselist.push(stringDefault);

					for (var j = 0; j < newPleaso.DefaultH1Chance; j++)
						pleaselist.push("# " + stringDefault);

					for (var j = 0; j < newPleaso.DefaultH2Chance; j++)
						pleaselist.push("## " + stringDefault);

					for (var j = 0; j < newPleaso.DefaultH3Chance; j++)
						pleaselist.push("### " + stringDefault);

					var chosen = pleaselist[Math.floor(Math.random() * pleaselist.length)];

					var normalFont = 100 - newPleaso.DefaultRNGFontChance - newPleaso.DefaultFlagChance;
					if (normalFont < 0) normalFont = 1;

					var newPleaseList = [];
					for (var j = 0; j < normalFont; j++)
						newPleaseList.push(chosen);

					for (var j = 0; j < newPleaso.DefaultRNGFontChance; j++)
						newPleaseList.push(RandFont(chosen));

					for (var j = 0; j < newPleaso.DefaultFlagChance; j++)
						newPleaseList.push(RandFont(chosen, 12));

					// pick a random one
					var num = Math.floor(Math.random() * newPleaseList.length);
					message.channel.send(newPleaseList[num]);
				}
			}
		}
	}
}

/**
 * Converts text to Unicode fancy fonts
 *
 * Transforms alphanumeric characters (a-z, A-Z, 0-9) to Unicode variants:
 * - Uses global.reverseLook lookup table for character mappings
 * - index = -1: Random font from available options
 * - index = 12: Flag emoji font
 * - Other indices: Specific font styles
 *
 * Preserves non-alphanumeric characters (spaces, punctuation, #, etc.) unchanged.
 *
 * @param {string} text - Text to transform
 * @param {number} [index=-1] - Font index (-1 for random, 12 for flags, 0-N for specific fonts)
 * @returns {string} Transformed text with fancy Unicode characters
 *
 * @example
 * RandFont("Hello") // Returns something like "ℍ𝕖𝕝𝕝𝕠" or "🇭🇪🇱🇱🇴"
 */
function RandFont(text, index = -1)
{
	var fonts = global.reverseLook;
	var newText = "";

	var rnd = Math.floor(Math.random() * fonts["A"].length);

	// loop through characters in text (ignoring # and space)
	for (var i = 0; i < text.length; i++)
	{
		// only replace a-z A-Z 0-9
		if (!text[i].match(/[a-zA-Z0-9]/))
		{
			newText += text[i];
			continue;
		}
		
		if (index == -1)
		{
			newText += fonts[text[i]][rnd];
		}
		else
		{
			newText += fonts[text[i]][index];
		}
	}

	return newText;
}

/**
 * Fish Easter egg system - replies with fish images based on message triggers
 *
 * Loads FISHcache.json and processes:
 * - Default occurrences: All fish added to pool with DefaultOccCount weight
 * - Keyword triggers (ProcFishless): If message contains FishWords, adds extra weight (FishBuff)
 * - Special "fish" word: 1/500 chance to send random fish from weighted pool
 *
 * Fish objects contain:
 * - url: Image URL to reply with
 * - DefaultOccCount: Base probability weight
 * - ProcFishless: If true, enables keyword checking
 * - FishWords: Comma-separated trigger phrases
 * - FishBuff: Multiplier for weight when keyword matches
 * - ProcChance: Probability divisor (1/ProcChance)
 *
 * @param {Message} message - Discord message to potentially reply to
 * @param {string} msgContent - Lowercase message content
 */
function checkForFish(message, msgContent)
{
	var fishData = fs.readFileSync(babadata.datalocation + "FISHcache.json");
	var fish = JSON.parse(fishData);

	var mesgtosend = [];  // Fish to send in response
	var allfish = [];     // Weighted pool of all fish URLs

	var fishio = msgContent.includes("fish");

	// Build weighted pool and check for keyword triggers
	for (var i = 0; i < fish.length; i++)
	{
		fishI = fish[i];

		// Add each fish to pool DefaultOccCount times (creates base probability weight)
		// Fish with higher DefaultOccCount appear more frequently
		for (var j = 0; j < fishI.DefaultOccCount; j++)
		{
			allfish.push(fishI.url);
		}

		// ProcFishless: Enable keyword-based triggering
		if (fishI.ProcFishless)
		{
			var procChance = 1 / fishI.ProcChance;
			var FishWords = fishI.FishWords;
			var FishWordSimilars = FishWords.split(", ");

			// Only check keywords if random chance succeeds OR message contains "fish"
			var chanceo = Math.random() < procChance;
			if (!chanceo && !fishio) continue;

			// Check if message contains any trigger words
			for (var j = 0; j < FishWordSimilars.length; j++)
			{
				if (msgContent.includes(FishWordSimilars[j]))
				{
					// Keyword match: Add extra copies to pool (FishBuff multiplier increases probability)
					for (var j = 0; j < (fishI.DefaultOccCount - 1) * fishI.FishBuff; j++)
					{
						allfish.push(fishI.url);
					}
					// Also queue this specific fish to send
					mesgtosend.push(fishI.url);
					break;
				}
			}
		}
	}

	// Special "fish" word handling: 1/500 chance to override and send random fish from pool
	if (fishio)
	{
		var one500 = Math.random() < (1/500);
		if (one500)
		{
			// Clear queued fish and pick one random fish from weighted pool
			mesgtosend = [];
			var num = Math.floor(Math.random() * allfish.length);
			mesgtosend = [allfish[num]];
		}
		else
		{
			// 499/500 chance: Don't send fish even though "fish" was mentioned
			mesgtosend = [];
		}
	}

	// Send all queued fish images as replies
	if (mesgtosend.length > 0)
	{
		for (var i = 0; i < mesgtosend.length; i++)
		{
			message.reply(mesgtosend[i]);
		}
	}
}

/**
 * Selects a random name from an array
 *
 * @param {Array<string>} names - Array of names to choose from
 * @returns {string} Randomly selected name
 */
function GetSimilarName(names)
{
	var num = Math.floor(Math.random() * names.length);
	var nam = names[num];
	return nam;
}

// ============================================
// Discord Builders - Buttons, Embeds, Modals
// ============================================

/**
 * Creates paginated button navigation for multiple embed texts
 *
 * Adds Previous/Next buttons to each page of content:
 * - Previous button: Disabled on first page
 * - Next button: Disabled on last page
 * - Button IDs: "page0", "page1", "page2", etc.
 * - Buttons use style 1 (Primary/Blue)
 *
 * Delegates to handleButtonsEmbed for interaction handling.
 *
 * @param {Array<Object>} texts - Array of embed objects to paginate
 * @param {Interaction} interaction - Discord interaction that triggered this
 * @param {Message} message - Message to attach buttons to
 */
function FrogButtons(texts, interaction, message)
{
	for (var i = 0; i < texts.length; i++)
	{
		var row = new Discord.ActionRowBuilder();
		
		var pButton = new Discord.ButtonBuilder().setCustomId("page"+(i - 1)).setLabel("Previous").setStyle(1);
		var nButton = new Discord.ButtonBuilder().setCustomId("page"+(1 + i)).setLabel("Next").setStyle(1);
		if (i == 0)
		{
			pButton.setDisabled(true);
		}
		if (i == texts.length - 1)
		{
			nButton.setDisabled(true);
		}

		row.addComponents(pButton, nButton);

		texts[i].components = [row];
	}
	handleButtonsEmbed(interaction.channel, message, interaction.user.id, texts);
}

/**
 * Handles "Jump to Haiku" button interactions with modal input
 *
 * Flow:
 * 1. Waits for button click with "jumpToHaiku" in customId
 * 2. Shows modal with text input for haiku number
 * 3. Validates input (must be positive integer ≤ data.length)
 * 4. Updates message to display selected haiku
 * 5. Resets collector timer and recurses to continue listening
 *
 * Modal configuration:
 * - Title: "Jump to Custom Haiku"
 * - Input: Short text (style 1), required
 * - Placeholder: "Haiku Number"
 * - Timeout: 100 seconds for button, 60 seconds for modal
 *
 * @param {Message} message - Message with button components
 * @param {string} userid - User ID allowed to interact
 * @param {Array<Object>} data - Array of haiku/embed data
 * @param {Collector} collector - Message component collector to reset timer
 */
function buttonsAwaitMessageComponent(message, userid, data, collector)
{
	const collectorFilter = i => {
		return i.user.id === userid && i.message.id === message.id && i.customId.includes("jumpToHaiku");
	};

	message.awaitMessageComponent({ filter: collectorFilter, componentType: ComponentType.Button, time: 100000 })
	.then(async initialInteraction => 
		{
			// open a modal with a text input for the user to enter the haiku number
			const modal = new ModalBuilder()
				.setCustomId('jumpToNumber')
				.setTitle('Jump to Custom Haiku');

			const input = new TextInputBuilder()
				.setCustomId('haikuNum')
				.setLabel("The number of the haiku you want to jump to")
				.setStyle(1)
				.setRequired(true)
				.setPlaceholder("Haiku Number");

			const firstActionRow = new ActionRowBuilder().addComponents(input);
			modal.addComponents(firstActionRow);

			initialInteraction.showModal(modal);

			await initialInteraction.awaitModalSubmit({
				filter: (i) =>
					  i.customId === "jumpToNumber" &&
					  i.user.id === userid,
				time: 60000,
			}).then(async (modalInteraction) => {
				modalInteraction.deferUpdate();
				var chansend = modalInteraction.fields.getTextInputValue("haikuNum");
				var num = parseInt(chansend);
				if (num != null && num > 0 && num <= data.length)
				{
					global.paged[message.id] = num - 1;
					// update the message to show the haiku at the given number
					message.edit(data[num - 1]);
					collector.resetTimer();
					buttonsAwaitMessageComponent(message, userid, data, collector);
				}
			});
		}
	)
	.catch(err => console.error(err, true));
}

/**
 * Global object tracking current page index for each message with pagination
 * Key: message ID, Value: current page index (0-based)
 */
global.paged = {};

/**
 * Sets up button-based pagination system for embeds
 *
 * Creates a message component collector that:
 * - Filters for "page" buttons clicked by specified user
 * - Updates message content when page buttons clicked
 * - Resets 30-second timeout on each interaction
 * - Tracks current page in global.paged object
 * - Also handles "jumpToHaiku" button via buttonsAwaitMessageComponent
 * - On timeout: Removes components or uses deadData fallback
 *
 * @param {Channel} channel - Discord channel for collector
 * @param {Message} message - Message to add pagination to
 * @param {string} userid - User ID allowed to interact with buttons
 * @param {Array<Object>} data - Array of page data/embeds to paginate through
 * @param {Array<Object>|null} [deadData=null] - Optional array of button-less versions for timeout state
 */
function handleButtonsEmbed(channel, message, userid, data, deadData = null)
{
	global.paged[message.id] = 0;
	console.log("Handling buttons embed");
	const filter = i => (i.customId.includes("page")) 
						&& i.message.id === message.id && i.user.id === userid;

	
	const collector = channel.createMessageComponentCollector({ filter, time: 30000 });
	collector.on('collect', async i => {
		if (i.customId.includes("page")) 
		{
			//i.deferUpdate();
			var page = parseInt(i.customId.replace("page", ""));
			global.paged[message.id] = page;

			i.update(data[page]);
			collector.resetTimer();

			//await i.update({ content: 'A button was clicked!', components: [] });
		}
	});

	buttonsAwaitMessageComponent(message, userid, data, collector);
 
	collector.on('end', collected => {
		if (deadData != null)
			message.edit({components: deadData[global.paged[message.id]]});
		else
			message.edit({components: []});
	});
}

/**
 * Checks if a URL exists (returns 404 or other status)
 *
 * @param {string} url - URL to check
 * @returns {Promise<boolean>} Returns true if URL exists (non-404), false if 404 or network error
 */
async function uExist(url)
{
	return new Promise((resolve) => {
		https.get(url, res => {
			if (res.statusCode === 404)
				resolve(false);
			else
				resolve(true);
		}).on('error', () => {
			// On network error, consider URL as non-existent
			resolve(false);
		});
	});
}

// ============================================
// Discord Audit Log Utilities
// ============================================

/**
 * Converts Discord audit log action type integer to readable string name
 *
 * Maps all Discord audit log event types (as of 2024):
 * - Guild operations (1)
 * - Channel operations (10-15)
 * - Member operations (20-28)
 * - Role operations (30-32)
 * - Invite operations (40-42)
 * - Webhook operations (50-52)
 * - Emoji operations (60-62)
 * - Message operations (72-75)
 * - Integration operations (80-85)
 * - Sticker operations (90-92)
 * - Guild scheduled event operations (100-102)
 * - Thread operations (110-112)
 * - Auto moderation operations (140-145)
 * - Creator monetization operations (150-151)
 * - Voice status operations (192)
 *
 * @param {number} int - Discord audit log action type integer
 * @returns {string} Human-readable action name or "Unknown" if not recognized
 *
 * @example
 * enumConverter(72) // Returns "MessageDelete"
 * enumConverter(22) // Returns "MemberBanAdd"
 */
function enumConverter(int)
{
	switch(int)
	{
		case 1:
			return "GuildUpdate";
		case 10:
			return "ChannelCreate";
		case 11:
			return "ChannelUpdate";
		case 12:
			return "ChannelDelete";
		case 13:
			return "ChannelOverwriteCreate";
		case 14:
			return "ChannelOverwriteUpdate";
		case 15:
			return "ChannelOverwriteDelete";
		case 20:
			return "MemberKick";
		case 21:
			return "MemberPrune";
		case 22:
			return "MemberBanAdd";
		case 23:
			return "MemberBanRemove";
		case 24:
			return "MemberUpdate";
		case 25:
			return "MemberRoleUpdate";
		case 26:
			return "MemberMove";
		case 27:
			return "MemberDisconnect";
		case 28:
			return "BotAdd";
		case 30:
			return "RoleCreate";
		case 31:
			return "RoleUpdate";
		case 32:
			return "RoleDelete";
		case 40:
			return "InviteCreate";
		case 41:
			return "InviteUpdate";
		case 42:
			return "InviteDelete";
		case 50:
			return "WebhookCreate";
		case 51:
			return "WebhookUpdate";
		case 52:
			return "WebhookDelete";
		case 60:
			return "EmojiCreate";
		case 61:
			return "EmojiUpdate";
		case 62:
			return "EmojiDelete";
		case 72:
			return "MessageDelete";
		case 73:
			return "MessageBulkDelete";
		case 74:
			return "MessagePin";
		case 75:
			return "MessageUnpin";
		case 80:
			return "IntegrationCreate";
		case 81:
			return "IntegrationUpdate";
		case 82:
			return "IntegrationDelete";
		case 83:
			return "StageInstanceCreate";
		case 84:
			return "StageInstanceUpdate";
		case 85:
			return "StageInstanceDelete";
		case 90:
			return "StickerCreate";
		case 91:
			return "StickerUpdate";
		case 92:
			return "StickerDelete";
		case 100:
			return "GuildScheduledEventCreate";
		case 101:
			return "GuildScheduledEventUpdate";
		case 102:
			return "GuildScheduledEventDelete";
		case 110:
			return "ThreadCreate";
		case 111:
			return "ThreadUpdate";
		case 112:
			return "ThreadDelete";
		case 121:
			return "ApplicationCommandPermissionUpdate";
		case 140:
			return "AutoModerationRuleCreate";
		case 141:
			return "AutoModerationRuleUpdate";
		case 142:
			return "AutoModerationRuleDelete";
		case 143:
			return "AutoModerationBlockMessage";
		case 144:
			return "AutoModerationFlagToChannel";
		case 145:
			return "AutoModerationUserCommunicationDisabled";
		case 150:
			return "CreatorMonetizationRequestCreated";
		case 151:
			return "CreatorMonetizationTermsAccepted";
		case 192:
			return "GuildVoiceStatusUpdate";
		default:
			return "Unknown";
	}
}

// ============================================
// Natural Language Time Parsing
// ============================================

/**
 * Parses natural language time strings into Date objects
 *
 * Supports multiple time formats and modifiers:
 *
 * Time formats (HH:MM:SS, HH:MM, or HH):
 * - "3:30pm" - Specific time with AM/PM
 * - "15:45" - 24-hour format
 * - "12am" - Converts 12am to midnight (0:00)
 * - Automatically advances to next day if time has passed
 *
 * Override keywords (highest precedence):
 * - "midnight" - Next midnight (00:00)
 * - "noon" - Next noon (12:00)
 *
 * Day period keywords:
 * - "tonight" - 6pm-11:59pm today (or current time-11:59pm if after 6pm)
 * - "tomorrow" - 7am-10pm next day
 *
 * Time of day modifiers (can combine with "tomorrow"):
 * - "morning" - 7am-11am
 * - "afternoon" - 12pm-5pm
 * - "evening" - 6pm-9pm
 * - "night" - 10pm-11:59pm
 * - "sometime" - Random time in next 5 days (or full day if with "tomorrow")
 *
 * Additional modifiers:
 * - "later" - Adds 0-2 hours to start time, extends end by 2 hours (or 0-5 hours if standalone)
 *
 * Algorithm:
 * 1. Parses explicit time if present
 * 2. Applies override keywords
 * 3. Applies day period and time-of-day constraints
 * 4. Randomly selects time within calculated range
 * 5. Returns one random time from all possible interpretations
 *
 * @param {string} timestring - Natural language time string
 * @returns {Date} Parsed future date/time
 *
 * @example
 * getTimeFromString("tomorrow morning") // Random time between 7am-11am tomorrow
 * getTimeFromString("tonight at 8pm") // 8pm tonight (or tomorrow if past)
 * getTimeFromString("3:30pm") // Next occurrence of 3:30pm
 */
function getTimeFromString(timestring)
{
	var currentTime = getD1(true);
	
	var time = timestring.split(":");
	var hour = 0;
	var minute = 0;
	var second = 0;

	var hourtime = null;
	if (time.length == 3)
	{
		hour = parseInt(time[0]);
		minute = parseInt(time[1]);
		second = parseInt(time[2]);
	}
	else if (time.length == 2)
	{
		hour = parseInt(time[0]);
		minute = parseInt(time[1]);
	}
	else if (time.length == 1)
	{
		hour = parseInt(time[0]);
	}

	var timepossibles = [];
	var newTime;
	
	if (!isNaN(hour))
	{
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), hour, minute, second);
		// if time is in the past, add a day

		// if contians am or pm convert to 24 hour time
		if (timestring.toLowerCase().includes("pm") && newTime.getHours() < 12)
		{
			newTime.setHours(newTime.getHours() + 12);
		}

		if (timestring.toLowerCase().includes("am") && hour == 12)
		{
			newTime.setHours(0);
		}

		if (newTime.getTime() < currentTime.getTime())
		{
			newTime.setDate(newTime.getDate() + 1);
		}

		hourtime = newTime;
		timepossibles.push(newTime);
	}
	// console.log("Time possibles: " + timepossibles);
	// Group OVERRIDE: (these take precedence over all other time strings)
	// midnight -> midnight of the next day
	// noon -> the next noon

	// Group A: 
	// tonight -> caps the time period from 6pm to 12am of day sent, if it is past 6pm it will be from current time to 12am
	// tomorrow -> caps the time period from 7am to 10pm of the next day

	// morning -> caps the time period from 7am to 11am of the day sent, can be used with tomorrow
	// afternoon -> caps the time period from 12pm to 5pm of the day sent, can be used with tomorrow

	// later -> uses existing time caps, has to also be > 1-2 (random) hours from current time, adds 2 hours to end of cap (if exists, else 6hrs from current time)
	// sometime -> uses existing time caps, 
	
	if (timestring.toLowerCase().includes("midnight"))
	{
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + 1, 0, 0, 0);
		timepossibles.push(newTime);
	}
	
	// console.log("Time possibles: " + timepossibles);
	if (timestring.toLowerCase().includes("noon") && !timestring.toLowerCase().includes("afternoon"))
	{
		var day = currentTime.getDate();
		if (currentTime.getHours() >= 12)
			day += 1;
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, 12, 0, 0);
		timepossibles.push(newTime);
	}

	if (timestring.toLowerCase().includes("tonight"))
	{
		var day = currentTime.getDate();
		var hourT = 18;
		var minuteT = 0;
		var secondT = 0;

		var extraSeconds = Math.random() * 60 * 60 * 2;

		if (currentTime.getHours() >= 18)
		{
			hourT = currentTime.getHours();
			minuteT = currentTime.getMinutes();
			secondT = currentTime.getSeconds();
		}

		var newTimeStart = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourT, minuteT, secondT);
		var newTimeEnd = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, 23, 59, 59);

		if (timestring.toLowerCase().includes("later") && hourtime == null)
		{
			newTimeStart.setSeconds(newTimeStart.getSeconds() + extraSeconds);
			newTimeEnd.setSeconds(newTimeEnd.getSeconds() + extraSeconds);
		}
		
		// if hourtime falls within the range, use that time
		if (hourtime != null && hourtime.getTime() >= newTimeStart.getTime() && hourtime.getTime() <= newTimeEnd.getTime())
		{
			hourT = hourtime.getHours();
			minuteT = hourtime.getMinutes();
			secondT = hourtime.getSeconds();
			hourTEd = hourtime.getHours();
			minuteTEd = hourtime.getMinutes();
			secondTEd = hourtime.getSeconds();
		}

		// get a time between start and end
		newTime = new Date(newTimeStart.getTime() + Math.random() * (newTimeEnd.getTime() - newTimeStart.getTime()));
		
		timepossibles.push(newTime);
	}

	if (timestring.toLowerCase().includes("tomorrow"))
	{
		var day = currentTime.getDate() + 1;
		var hourT = 7;
		var minuteT = 0;
		var secondT = 0;

		var hourTEd = 22;
		var minuteTEd = 0;
		var secondTEd = 0;

		if (timestring.toLowerCase().includes("morning"))
		{
			hourT = 7;
			hourTEd = 11;
		}
		else if (timestring.toLowerCase().includes("afternoon"))
		{
			hourT = 12;
			hourTEd = 17;
		}
		else if (timestring.toLowerCase().includes("evening"))
		{
			hourT = 18;
			hourTEd = 21;
		}
		else if (timestring.toLowerCase().includes("night"))
		{
			hourT = 22;
			hourTEd = 23;
			minuteTEd = 59;
			secondTEd = 59;
		}
		else if (timestring.toLowerCase().includes("sometime"))
		{
			hourT = 0;
			hourTEd = 23;
			minuteTEd = 59;
			secondTEd = 59;
		}

		if (hourtime != null)
		{
			hourT = hourtime.getHours();
			minuteT = hourtime.getMinutes();
			secondT = hourtime.getSeconds();
			hourTEd = hourtime.getHours();
			minuteTEd = hourtime.getMinutes();
			secondTEd = hourtime.getSeconds();
		}

		var newTimeStart = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourT, minuteT, secondT);
		var newTimeEnd = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourTEd, minuteTEd, secondTEd);

		if (timestring.toLowerCase().includes("later") && hourtime == null)
		{
			newTimeStart.setSeconds(newTimeStart.getSeconds() + extraSeconds);
			newTimeEnd.setSeconds(newTimeEnd.getSeconds() + extraSeconds);
		}

		newTime = new Date(newTimeStart.getTime() + Math.random() * (newTimeEnd.getTime() - newTimeStart.getTime()));
		
		timepossibles.push(newTime);
	}

	if (!timestring.toLowerCase().includes("tomorrow") && !timestring.toLowerCase().includes("tonight"))
	{
		if (timestring.toLowerCase().includes("later"))
		{
			var extraSeconds = Math.random() * 60 * 60 * 2;
			var extraSecondsLength = Math.random() * 60 * 60 * 5;
	
			if (hourtime != null)
			{
				newTime = new Date(hourtime.getTime() + extraSeconds);
			}
			else
			{
				newTime = new Date(currentTime.getTime() + extraSeconds + extraSecondsLength);
			}
			timepossibles.push(newTime);
		}
	
		if (timestring.toLowerCase().includes("sometime"))
		{
			// pick a random time in next 5 days
			var seconds = Math.random() * 60 * 60 * 24 * 5;
			newTime = new Date(currentTime.getTime() + seconds);
			timepossibles.push(newTime);
		}

		if (timestring.toLowerCase().includes("morning"))
		{
			var day = currentTime.getDate();
			var hourT = 7;
			var minuteT = 0;
			var secondT = 0;
			var hourTEd = 11;
			var minuteTEd = 0;
			var secondTEd = 0;

			if (hourtime != null && hourtime.getHours() >= 7 && hourtime.getHours() <= 11)
			{
				hourT = hourtime.getHours();
				minuteT = hourtime.getMinutes();
				secondT = hourtime.getSeconds();
				hourTEd = hourtime.getHours();
				minuteTEd = hourtime.getMinutes();
				secondTEd = hourtime.getSeconds();
			}

			var newTimeStart = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourT, minuteT, secondT);
			var newTimeEnd = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourTEd, minuteTEd, secondTEd);

			newTime = new Date(newTimeStart.getTime() + Math.random() * (newTimeEnd.getTime() - newTimeStart.getTime()));

			// if time is in the past, add a day
			if (newTime.getTime() < currentTime.getTime())
			{
				newTime.setDate(newTime.getDate() + 1);
			}

			timepossibles.push(newTime);
		}

		if (timestring.toLowerCase().includes("afternoon"))
		{
			var day = currentTime.getDate();
			var hourT = 12;
			var minuteT = 0;
			var secondT = 0;
			var hourTEd = 17;
			var minuteTEd = 0;
			var secondTEd = 0;

			if (hourtime != null && hourtime.getHours() >= 12 && hourtime.getHours() <= 17)
			{
				hourT = hourtime.getHours();
				minuteT = hourtime.getMinutes();
				secondT = hourtime.getSeconds();
				hourTEd = hourtime.getHours();
				minuteTEd = hourtime.getMinutes();
				secondTEd = hourtime.getSeconds();
			}

			var newTimeStart = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourT, minuteT, secondT);
			var newTimeEnd = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourTEd, minuteTEd, secondTEd);

			newTime = new Date(newTimeStart.getTime() + Math.random() * (newTimeEnd.getTime() - newTimeStart.getTime()));

			// if time is in the past, add a day
			if (newTime.getTime() < currentTime.getTime())
			{
				newTime.setDate(newTime.getDate() + 1);
			}

			timepossibles.push(newTime);
		}

		if (timestring.toLowerCase().includes("evening"))
		{
			var day = currentTime.getDate();
			var hourT = 18;
			var minuteT = 0;
			var secondT = 0;
			var hourTEd = 21;
			var minuteTEd = 0;
			var secondTEd = 0;

			if (hourtime != null && hourtime.getHours() >= 18 && hourtime.getHours() <= 21)
			{
				hourT = hourtime.getHours();
				minuteT = hourtime.getMinutes();
				secondT = hourtime.getSeconds();
				hourTEd = hourtime.getHours();
				minuteTEd = hourtime.getMinutes();
				secondTEd = hourtime.getSeconds();
			}

			var newTimeStart = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourT, minuteT, secondT);
			var newTimeEnd = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, hourTEd, minuteTEd, secondTEd);

			newTime = new Date(newTimeStart.getTime() + Math.random() * (newTimeEnd.getTime() - newTimeStart.getTime()));

			// if time is in the past, add a day
			if (newTime.getTime() < currentTime.getTime())
			{
				newTime.setDate(newTime.getDate() + 1);
			}

			timepossibles.push(newTime);
		}
	}

	// pick a random time from the possible times
	var time = timepossibles[Math.floor(Math.random() * timepossibles.length)];
	// convert to current timezone
	// console.log(timepossibles);

	// hourtime = new Date(hourtime.getTime() - (hourtime.getTimezoneOffset() * 60000));

	return time;
}


// ============================================
// Emoji Reaction System
// ============================================

/**
 * Applies intelligent emoji reactions based on message content matching
 *
 * Loads emojiJSONCache.json and analyzes message for keyword matches:
 *
 * Matching algorithm:
 * 1. Checks if emoji name parts (min 3 chars) appear in message
 * 2. Checks if actual emoji characters appear in message
 * 3. Filters out skin tone variations
 * 4. Groups matches by category for diverse reactions
 *
 * Reaction strategy:
 * - Randomly selects from matched categories to avoid clustering
 * - Moves used categories to secondary pool
 * - Cycles through emoji variations within each match
 * - Continues until reactneeded count reached or emojis exhausted
 *
 * Used during special events (e.g., April Fools) for extreme emoji spam.
 *
 * @param {Message} message - Discord message to react to
 * @param {string} msgContent - Lowercase message content for matching
 * @param {number} [reactneeded=0] - Number of emoji reactions to add
 * @returns {Promise<void>}
 *
 * @example
 * extremeEmoji(message, "i love cats and dogs", 10) // Adds 10 emoji reactions matching keywords
 */
async function extremeEmoji(message, msgContent, reactneeded=0)
{
	// load babadata.datalocation + "emojiJSONCache.json
	var rawdata = fs.readFileSync(babadata.datalocation + "emojiJSONCache.json");
	var emojis = JSON.parse(rawdata).emojis;

	var goodfellas = {};

	// loop through emoji list length
	for (var i = 0; i < emojis.length; i++) //
	{
		var eName = emojis[i].name;
		var eCategory = emojis[i].category;
		var eSubCategory = emojis[i].category;
		// var eChar = emojis[i].emoji;
		var selections = emojis[i].emojis;

		eCategory += " " + eSubCategory;

		// replace _ in shortname with space
		// eShortName = eShortName.replace(/_/g, " ");

		// allow name to only have a-z 0-9 and space (force lowercase)
		eName = eName.toLowerCase().replace(/[^a-z0-9 ]/g, "");
		// eShortName = eShortName.toLowerCase().replace(/[^a-z0-9 ]/g, "");

		var subValues = [];
		var subValueseName = eName.split(" ");
		// var subValueseShortName = eShortName.split(" ");

		// add all sub values to array
		subValues = subValues.concat(subValueseName);
		// subValues = subValues.concat(subValueseShortName);

		// remove duplicates
		subValues = subValues.filter((v, i, a) => a.indexOf(v) === i);

		subValues.push(selections[0]);

		// skip emoji if it has skin tone in it
		// if (eName.includes("skin tone") || eShortName.includes("skin tone"))
		// 	continue;

		// check if any sub values are in the message
		var found = false;

		for (var j = 0; j < selections.length; j++)
		{
			var eChars = selections[j];
			if (msgContent.toLowerCase().includes(eChars) || msgContent.includes(eChars))
			{
				found = true;
				break;
			}
		}

		if (!found)
		{
			for (var j = 0; j < subValues.length; j++)
			{
				// skip if sub value is < 3 characters
				if (subValues[j].length < 3 && subValues[j] != selections[0])
					continue;
				if (msgContent.toLowerCase().includes(subValues[j]))
				{
					found = true;
					break;
				}
				if (message.content.toLowerCase().includes(subValues[j]))
				{
					found = true;
					break;
				}
			}
		}

		if (eName == "mediumlight skin tone" || eName == "medium skin tone" || eName == "mediumdark skin tone" || eName == "dark skin tone" || eName == "light skin tone")
			found = false;

		// if found add to list
		if (found)
		{
			// add new category to goodfellas if it doesn't exist
			if (goodfellas[eCategory] == null)
				goodfellas[eCategory] = [];

			// if name already exists in category, skip
			var exists = false;
			for (var j = 0; j < goodfellas[eCategory].length; j++)
			{
				if (goodfellas[eCategory][j].name == eName)
				{
					exists = true;
					break;
				}
			}

			// add emoji to category
			if (!exists)
				goodfellas[eCategory].push({name: eName, emojis: selections});
		}
	}

	// if goodfellas is empty, return
	if (Object.keys(goodfellas).length == 0)
	{
		return;
	}

	// console.log("goodfellas: " + Object.keys(goodfellas).length);
	
	var slightlyusedcategories = {};

	// console.log("Reacting with: " + reactneeded + " emojis.");

	reactEmoji(goodfellas, slightlyusedcategories, message, reactneeded);
}

/**
 * Recursive emoji reaction engine for extremeEmoji system
 *
 * Implements multi-round emoji selection algorithm:
 *
 * Round progression:
 * 1. Primary pool (goodfellas): Fresh categories, one emoji per category
 * 2. Secondary pool (slightlyusedcategories): Categories used once
 * 3. Next round pool (goodfellasRoundNext): Categories with remaining emoji variations
 *
 * Selection process:
 * - Picks random category from current pool
 * - Picks random emoji name from category
 * - Picks random variation of that emoji
 * - Removes used variation, preserves emoji if variations remain
 * - Moves category to secondary pool after first use
 * - Handles reaction failures by incrementing reactneeded counter
 * - Stops early if message deleted (error code 10008)
 *
 * This creates diverse reactions by cycling through categories before repeating.
 *
 * @param {Object} goodfellas - Primary emoji pool, grouped by category
 * @param {Object} slightlyusedcategories - Secondary pool for used categories
 * @param {Message} message - Discord message to react to
 * @param {number} reactneeded - Remaining reactions to add
 * @returns {Promise<void>}
 */
async function reactEmoji(goodfellas, slightlyusedcategories, message, reactneeded)
{
	var goodfellasRoundNext = {};
	// while reactcount is less than maxemoji
	while (reactneeded > 0)
	{
		// if no categories left and slightlyusedcategories is empty, return
		if (Object.keys(goodfellas).length == 0)
		{
			if (Object.keys(slightlyusedcategories).length == 0)
			{
				if (goodfellasRoundNext != null && Object.keys(goodfellasRoundNext).length > 0)
				{
					goodfellas = goodfellasRoundNext;
					goodfellasRoundNext = {};
					slightlyusedcategories = {};
				}
				else
				{
					console.log("No emojis remaining.");
					return;
				}
			}
			else
			{
				goodfellas = slightlyusedcategories;
				slightlyusedcategories = {};
			}
		}
		
		// get random category
		var categories = Object.keys(goodfellas);
		var category = categories[Math.floor(Math.random() * categories.length)];

		// get category emojis
		var categoryemojis = goodfellas[category];

		// get random emoji
		var emoji = categoryemojis[Math.floor(Math.random() * categoryemojis.length)];

		// select a random emoji from theEmojis
		var emojiChosen = emoji.emojis[Math.floor(Math.random() * emoji.emojis.length)];

		var emojoIndex = emoji.emojis.indexOf(emojiChosen);
		// remove emoji from theEmojis
		emoji.emojis.splice(emojoIndex, 1);

		// if emoji.emojis is not empty, add to goodfellasRoundNext
		if (emoji.emojis.length > 0)
		{
			if (goodfellasRoundNext[category] == null)
				goodfellasRoundNext[category] = [];

			goodfellasRoundNext[category].push(emoji);
		}

		// remove emoji from category
		var index = categoryemojis.indexOf(emoji);
		categoryemojis.splice(index, 1);

		// if category is empty, remove category
		if (categoryemojis.length == 0)
			delete goodfellas[category];
		// else move category to slightlyusedcategories
		else
		{
			slightlyusedcategories[category] = categoryemojis;
			delete goodfellas[category];
		}

		reactneeded--;
		// react with emoji
		// console.log("Reacting with: " + emoji.char + " -- " + emoji.name);
		await message.react(emojiChosen).catch(
			function(error)
			{
				// if unknown message, skip all emojis
				if (error.code == 10008)
				{
					reactneeded = 0;
					return;
				}
				console.error(error);
				reactneeded++;
			}
		);

		// console.log("reactneeded: " + reactneeded);
		// console.log("-----------------");
	}
}

// ============================================
// Random Time Manipulation
// ============================================

/**
 * Randomizes time components based on D20 roll (gambling/gamba feature)
 *
 * Roll effects:
 * - Roll 11-20: Randomizes minutes (0-59)
 * - Roll 17-20: Also randomizes seconds (0-59)
 * - Roll 1-10: No modification
 *
 * Creates uncertainty in scheduled times for gambling-style features.
 *
 * @param {Date} time - Date object to randomize
 * @returns {Date} Modified date with randomized time components
 *
 * @example
 * GambaRoll(new Date()) // 55% chance to randomize minutes, 20% chance to also randomize seconds
 */
function GambaRoll(time)
{
	var roll = Math.floor(Math.random() * 20) + 1;
	if (roll > 10)
		time.setMinutes(Math.floor(Math.random() * 60));
	if (roll > 16)
		time.setSeconds(Math.floor(Math.random() * 60));

	return time;
}

// ============================================
// Module Exports
// ============================================

/**
 * Exported helper functions for use throughout the bot
 *
 * Exports organized by category:
 *
 * Discord User Management:
 * - RoleAdd: Add roles to multiple users
 * - dailyRandom: Timeout user (wrapper)
 *
 * Easter Eggs & Reactions:
 * - preformEasterEggs: Main Easter egg processor
 *
 * Date/Time Utilities:
 * - dateDiffInDays: DST-safe day difference calculation
 * - FindDate: Parse dates from natural language
 * - GetDate: Calculate holiday dates
 * - getTimeFromString: Parse natural language time strings
 *
 * Holiday Management:
 * - MonthsPlus: Automatic seasonal theme updates
 * - SetHolidayChan: Configure holiday channel
 * - CreateChannel: Create new holiday channel
 * - progressSimple: Generate year progress bar
 *
 * Discord Builders:
 * - FrogButtons: Create paginated button navigation
 * - handleButtonsEmbed: Button pagination system
 *
 * String & File Operations:
 * - antiDelay: Process file attachments (wrapper)
 * - getAttachment: Extract message attachment
 * - fronge: Remove all message reactions
 * - Seperated: Split strings for Discord message limit
 *
 * Utilities:
 * - CheckFrogID: Check user ID in frog array
 * - GetSimilarName: Random name selector
 * - uExist: URL existence checker (deprecated)
 * - enumConverter: Audit log enum to string
 * - channelStatusChange: Update voice channel status
 */
module.exports = {
	RoleAdd,
    preformEasterEggs,
    dateDiffInDays,
    antiDelay,
    getAttachment,
    dailyRandom,
    fronge,
    CheckFrogID,
    CreateChannel,
    FindDate,
	MonthsPlus,
    GetDate,
    SetHolidayChan,
    GetSimilarName,
    FrogButtons,
    handleButtonsEmbed,
	uExist,
	Seperated,
	enumConverter,
	getTimeFromString,
	progressSimple,
	channelStatusChange
};