var babadata = require('./babotdata.json'); //baba configuration file
const fs = require('fs');
const Discord = require('discord.js'); //discord module for interation with discord api
const { SetHolidayChan, CreateChannel, MonthsPlus, loadInDBFSV } = require('./helperFunc');
const { cacheDOW } = require('./database');


var to = null;
var toWed = null;

function dailyCallStart(bot)
{
	loadInDBFSV();
	bot.guilds.fetch(babadata.guildId).then(guild =>
	{
		dailyCall(bot, guild);
	});
}


function dailyCall(bot, guild)
{
	var dateoveride = [false, 1, 1]; //allows for overiding date manually (testing)

	var yr = new Date().getFullYear(); //get this year
	var dy = dateoveride[0] ? dateoveride[2] : new Date().getDate(); //get this day
	var my = dateoveride[0] ? dateoveride[1] - 1 : new Date().getMonth(); //get this month
	var d1 = new Date(yr, my, dy) //todayish

	console.log("Daily Call Running: " + d1.toDateString());
	var now = new Date();
	var midnight = new Date();
    midnight.setHours(24);
    midnight.setMinutes(1);
    midnight.setSeconds(0);
    midnight.setMilliseconds(0);
	var timeToMidnight = midnight.getTime() - now.getTime();

	let rawdata = fs.readFileSync(babadata.datalocation + "FrogHolidays/" + 'frogholidays.json'); //load file each time of calling wednesday
	let frogdata = JSON.parse(rawdata);

	var g = bot.guilds.resolve(frogdata.froghelp.mainfrog);

	holidayDaily(d1, g);

	if ((global.dbAccess[1] && global.dbAccess[0]))
	{
		cacheDOW();
	}
	
	if (d1.getDay() == 3)
	{
		guild.channels.fetch()
		.then(channels => 
		{
			console.log(`There are ${channels.size} channels.`)
			bannedCats = [];
			bannedKittens = ["826320007675641876", "917516043583361034"];
			for (let current of channels) 
			{
				if (current[1].type == "GUILD_CATEGORY")
				{
					if (current[1].name.toLowerCase() == "the seat of the gods" || current[1].name.toLowerCase() == "archive")
					{
						bannedCats.push(current[1].id);
					}
				}
			}
			
			coolCats = [];
			for (let currenter of channels) 
			{
				if (currenter[1].type == "GUILD_TEXT" && !bannedKittens.includes(currenter[1].id))
				{
					if (!bannedCats.includes(currenter[1].parentId))
						coolCats.push(currenter[1]);
				}
			}
			
			var coolestCat = coolCats[Math.floor(Math.random() * coolCats.length)];
			
			var eightAM = new Date();
			eightAM.setHours(8);
			eightAM.setMinutes(0);
			eightAM.setSeconds(0);
			eightAM.setMilliseconds(0);
			var tenPM = new Date();
			tenPM.setHours(22);
			tenPM.setMinutes(0);
			tenPM.setSeconds(0);
			tenPM.setMilliseconds(0);

			var timeToEightAM = Math.max(eightAM.getTime() - now.getTime(), 0);
			var timeToTenPM = Math.max(tenPM.getTime() - now.getTime(), 0);

			var rndTime = Math.floor(Math.random() * (timeToTenPM - timeToEightAM)) + timeToEightAM;
			console.log("Sending to " + coolestCat.name + " at " + new Date(now.getTime() + rndTime).toTimeString());

			toWed = setTimeout(function()
			{
				coolestCat.send("It is Wednesday, My Dudes!");
				toWed = null;
			}, rndTime);
		})
		.catch(console.error);
	}

	console.log("Calling next command in: " + timeToMidnight / 1000 / 60 + " minutes");
	to = setTimeout(function()
	{
		dailyCall(bot, guild);
	}, timeToMidnight);
}



function holidayDaily(d1, server)
{
	if (d1.getMonth() < 9)
	{
		if (babadata.holidayval != "defeat" && d1.getMonth() == 0 && d1.getDate() == 1 && babadata.holidayval != "null")
		{
			SetHolidayChan(server, "defeat");
		}
	}
	else if (d1.getMonth() >= 9)
	{
		if (babadata.holidaychan == 0)
		{
			CreateChannel(server, "text channels", d1);
		}
		MonthsPlus(server, d1);
	}
}


var cleanupFn = function cleanup() 
{
	console.log("Ending Daily Call Timer");
	if (to != null)  
		clearTimeout(to);
	if (toWed != null)  
		clearTimeout(toWed);
}

process.on('SIGINT', cleanupFn);
process.on('SIGTERM', cleanupFn);

module.exports = {
    dailyCallStart
};