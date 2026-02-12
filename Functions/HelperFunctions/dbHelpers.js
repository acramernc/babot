/**
 * @fileoverview Database Helper Functions for Baba Discord Bot
 *
 * Provides database and text processing utilities:
 *
 * SQL Security:
 * - sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise():
 *   Escapes special characters to prevent SQL injection attacks
 *   Handles: null bytes, backspace, tab, ctrl-Z, newline, carriage return,
 *   quotes, backslashes, and percent signs
 *
 * Text Normalization:
 * - normalizeMSG(): Converts Unicode variations to standard characters
 * - Uses character lookup table for consistency across different Unicode forms
 * - Ensures haiku search works with various character representations
 *
 * Character Lookup:
 * - LoadTextChangeLookup(): Loads normalization mappings from JSON
 * - Populates global.reverseLook for font conversion system
 * - bidirectional mapping for text transformation
 *
 * Haiku Detection:
 * - Pattern matching for identifying haiku-like messages
 *
 * @module dbHelpers
 */

var babadata = require('../../babotdata.json'); //baba configuration file

const fs = require('fs');

var lookuptable = {};
global.reverseLook = {};

/**
 * Escapes SQL special characters to prevent injection attacks
 *
 * Named humorously as a reminder that SQL injection is a serious security concern.
 * This function should be used on ALL user input before including in SQL queries.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for SQL queries
 */
function sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise(str)
 {
    return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) 
	{
        switch (char) {
            case "\0":
                return "\\0";
            case "\x08":
                return "\\b";
            case "\x09":
                return "\\t";
            case "\x1a":
                return "\\z";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\"":
            case "'":
            case "\\":
            case "%":
                return "\\"+char;
            default:
                return char;
        }
    });
}

function loadInDBFSV()
{
	var rawdata = fs.readFileSync(babadata.datalocation + "comparisions.fsv", {encoding:'utf8', flag:'r'});
	//console.log(rawdata);
	var result = rawdata.split(/\r?\n/);
	for (var i = 1; i < result.length; i++)
	{
		var lnez = result[i].split("🐸");
		var actual = "";
		var atchually = "";
		for (var j = 1; j < lnez.length - 2; j++)
		{
			iteml = lnez[j].toLowerCase();

			if (j == 1) 
			{
				actual = iteml;
				atchually = lnez[j];
				if (global.reverseLook[lnez[j]] == undefined) global.reverseLook[lnez[j]] = [];
			}
			else
			{
				if (typeof lookuptable[iteml] == 'undefined' && iteml != actual)
				{
					lookuptable[iteml] = actual;
				}

				if (global.reverseLook[atchually] == undefined) global.reverseLook[atchually] = [];
					global.reverseLook[atchually].push(lnez[j]);
			}
		}
	}
}

function normalizeMSG(msgContent)
{
	var newmesg = "";

	var msCNT = [...msgContent]

	for (var i = 0; i < msCNT.length; i++)
	{
		var c = msCNT[i];

		if (lookuptable[c] != undefined)
		{
			newmesg += lookuptable[c];
			if (lookuptable[c + " "] != undefined && msCNT[i + 1] == " ")
			{
				i++;
			}
		}
		else
		{
			newmesg += c;
		}
	}
	
	return newmesg;
}

module.exports = {
    sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise,
    loadInDBFSV,
    normalizeMSG
};