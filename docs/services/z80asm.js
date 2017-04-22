'use strict';

// this retrieves the existing module
var myModule = angular.module('myApp.services');

myModule.factory('z80asm', ['z80opCodes', function(z80opCodes) {

    var pseudoOps = {
        '.ORG': setAddress,
        '.BYTE': getBytes,
        '.WORD': getWords,
        '.TEXT': getText,
        '.EQU': somethingMysterious
    };


    var opFragments = [];
    var opBlocks = {};

    var defines = {};
    var labels = {};
    var errors = {};
    var parsed = {};

    var address = 0;
    var code = [];

    
    function setAddress(val) {
        address = getParameterValue(val[0],0);
    }
    function prepareParamsLine(line) {
        var l1,l2,val;
        while(true) {
            if (line.indexOf("'") === -1)
                break;
            var l1 = line.indexOf("'");
            var l2 = line.indexOf("'",l1+1);
            if (l2 === l1+2) {
                val = line.charCodeAt(l1+1);
                line = line.substr(0,l1)+val+line.substr(l2+1);
            } else {
                break;
            }
        };
        var params = line.split(',');
        params = params.map(function(p) {
            return getCalculatedParameter(p.trim());
        });
        return params;
    }
    function prepareParams(val) {
        var params = val.join(" ").split(",");
        params = params.map(function(p) {
            return getCalculatedParameter(p.trim());
        });
        return params;
    }
    function getBytes(val,line,line_number,pass,parsedLines) {
        var params = prepareParamsLine(line);
        if (pass === 1) {
            parsedLines[address] = line_number;
        }
        for(var i = 0; i < params.length; i++) {
            code[address++] = params[i];
        }
    }
    function getWords(val,line,line_number,pass,parsedLines) {
        var params = prepareParams(val,line_number,pass,parsedLines);
        if (pass === 1) {
            parsedLines[address] = line_number;
        }
        for(var i = 0; i < params.length; i++) {
            code[address++] = params[i] & 0xff;;
            code[address++] = (params[i] >> 8) & 0xff;;
        }
    }

    function getText(val,line,line_number,pass,parsedLines) {
        var params = line.substring(line.indexOf('"')+1,line.lastIndexOf('"'));
        if (pass === 1) {
            parsedLines[address] = line_number;
        }
        for(var i = 0; i < params.length; i++) {
            code[address++] = params.charCodeAt(i);
        }
    }

    var somethingMysterious = function(val) {

    };




// given an arbitrary string like
    function getCalculatedParameter(param,pass) {        
        if (param.substring(0,1) === '"') {
            return param.substring(1,param.lastIndexOf('"'));
        }
        do {
            var p = param.indexOf("'");
            if (p !== -1) {
                param = param.substring(0,p) + param.charCodeAt(p+1) + param.substring(p+3);
            }
        } while(p !== -1);
        var binaries = param.match(/%[01]+/g);
        if (binaries) {
            for(var i = 0; i < binaries.length; i++) {
                var loc = param.indexOf(binaries[i]);
                var start = param.substring(0,loc);
                var end = param.substring(loc+binaries[i].length);
                param = start + " "+ parseInt(binaries[i].substring(1),2) + " "+end;
            }
        }
        var hexs = param.match(/\$[0-9,a-f,A-F]+/g);
        if (hexs) {
            for(i = 0; i < hexs.length; i++) {
                var loc = param.indexOf(hexs[i]);
                var start = param.substring(0,loc);
                var end = param.substring(loc+hexs[i].length);
                param = start + " "+ parseInt(hexs[i].substring(1),16) + " "+end;
            }
        }

        var values = param.split(/([\+\-\/\*%])/);
        values = values.filter(function(v){
            return v.trim().length > 0;
        });
        
        for(var i = 0; i < values.length; i+=2) {
            values[i] = getParameterValue(values[i].trim(),pass);
            if (typeof values[i] === 'object') {
                return values[i];
            }
        }
        var total = 0;
        var operator = '+';
        for(i = 0; i < values.length; i+=2) {
            switch(operator) {
                case '+':
                   total += values[i];
                   break;
                case '-':
                   total -= values[i];
                   break;
                case '*':
                   total *= values[i];
                   break;
                case '/':
                   total /= values[i];
                   break;
                case '%':
                   total %= values[i];
                   break;
            }
            operator = values[i+1];
        }
        return total;
    }

    function getParameterValue(param,pass) {
        if (param.substring(0, 1).toLowerCase() === 'l')  { // is it a label?
            if (labels.hasOwnProperty(param)) {
                return labels[param];
            } else {
                if (pass === 1) {
                    return {error: 'Label "'+param+'" not found.'};
                }
                return 0;
            }
        } else {
            if (param.substring(0,1) === '(') {
                param = param.substring(1,param.length-2).trim();
            }
            if (param === '$') {
                return address;
            }
            if (param.substring(0,1) === '$') { // is it hex
                return Number("0x"+param.substring(1).toString(16));
            }
            if (param.substring(0,1) === '%') { // binary?
                return Number("0b"+param.substring(1).toString(2));
            }
            if (param.substring(0,1) === "'") { // a single character quote
                return param.charCodeAt(1);
            }
            return Number(param);
        }
    };

    var parseMacro = function(line) {
        var frags = line.split(/[ ]+/);
        if (frags[0].toLowerCase() === '#define') {
            if (frags.length === 3) {
                defines[frags[1]] = frags[2];
            }
        } else {
// it's an error
        }
    };
    var parseLine = function(line,line_number,pass,parsedLines) {
// get rid of comments
        var instruction_address = address;
        var lx = line.split(';');
        if (lx[0].trim().length === 0) {
            return;
        }
        line = lx[0].trim();
        if(line.substring(0, 1) === '#') {
            parseMacro(line);
            return;
        }
        var frags = line.split(/[ ]+/);
        frags = frags.map(function(frag){
            return frag.trim();
        });
// check if the first fragment is a label
        if (frags[0].lastIndexOf(':') === frags[0].length - 1) {
            labels[frags[0].substring(0,frags[0].length -1)] = address;
            frags.shift();
            if (frags.length === 0) {
                parsed['Line '+line_number] = line;
                return;
            }
        }
// see if we need to translate a defined value
        var op = frags[0];
        if (defines.hasOwnProperty(frags[0])) {
            frags[0] = defines[frags[0]];
        }
// see if it's a pseudo op
        if (pseudoOps.hasOwnProperty(frags[0])) {
            var actions = pseudoOps[frags[0]];
            line = line.substring(line.indexOf(op)+op.length).trim();
            frags.shift();
            actions(frags,line,line_number,pass,parsedLines);
            parsed['Line '+line_number] = line;
            return;
        }
// see if we have an opcode
        var therest = frags.join(' ');

        if (opBlocks.hasOwnProperty(therest)) {
            var actions = opBlocks[therest];
            if ( actions instanceof Array) {
                if (pass === 1) {
                    parsedLines[address] = line_number;
                }
                for(var i = 0; i < actions.length; i++) {
                    code[address++] = actions[i];
                }
                parsed['Line '+line_number] = line;
            } else {
                errors['Line '+line_number] = line;
            }
            return;
        }
        else {
            var line_remaining = therest;
            for(var prop = 0; prop < opFragments.length; prop++) {
                therest = line_remaining;
                var bytenegate = false;
                var op_frag = opFragments[prop][1];
                if((therest.indexOf(op_frag.substring(0,op_frag.length -1)) === 0) &&
                    (op_frag.charAt(op_frag.length -1) === '+') &&
                    (therest.charAt(op_frag.length -1) === '-' )) {
                        therest = therest.substring(0,op_frag.length - 1) + '+' + therest.substring(op_frag.length);
                        bytenegate = true;
                }

                if (therest.indexOf(op_frag) === 0) {
                    var value = null;
                    if (opFragments[prop].length === 3) {
                        value = getCalculatedParameter(therest.substring(op_frag.length,ix2),pass);
                    }
                    else if (therest.indexOf(opFragments[prop][3]) !== -1) {
                        // need to prevent false positives here
                        var ix2 = therest.lastIndexOf(opFragments[prop][3]);
                        value = getCalculatedParameter(therest.substring(op_frag.length,ix2,pass));
                    }
                    if ((value !== null) && ( opFragments[prop][0] instanceof Array)) {
                        if (typeof value === 'object') {
                            errors['Line '+line_number] = value.error;
                            return;
                        }
                        var IX = false;
                        if (pass === 1) {
                            parsedLines[address] = line_number;
                        }                        
                        if ((opFragments[prop][2] === 'B') && 
                            ((opFragments[prop][0][0] === 0xFD) || (opFragments[prop][0][0] === 0xDD)) &&
                             (opFragments[prop][0][1] === 0xCB)) {
                            code[address+0] = opFragments[prop][0][0];
                            code[address+1] = opFragments[prop][0][1];
                            code[address+3] = opFragments[prop][0][2];
                            address += 2;
                            IX = true;
                        }
                        else {
                            for(var i = 0; i < opFragments[prop][0].length; i++) {
                                code[address++] = opFragments[prop][0][i];
                            }
                        }
                        switch(opFragments[prop][2]){
                            case 'BB':
                                var value2 = getCalculatedParameter(therest.substring(ix2 + opFragments[prop][3].length),pass);
                                if(bytenegate) {
                                    value = 256-value;
                                }
                                code[address++] = value;
                                code[address++] = value2;
                                break;
                            case 'B':
                                if(bytenegate) {
                                    value = 256-value;
                                }
                                code[address++] = value;
                                break;
                            case 'W':
                                code[address++] = value & 0xff;
                                code[address++] = (value / 256) & 0xff;
                                break;
                            case 'R':
                                 code[address++] = (value - instruction_address - opFragments[prop][0].length - 1) & 0xff;
                        }
                        if (IX) {
                            address++;
                        }
                        parsed['Line '+line_number] = line;
                        return;
                    }
                }
            }
        }
        errors['Line '+line_number] = line;
    };

    var assemble = function(source) {
        opFragments = [];
        opBlocks = {};

        defines = {};
        labels = {};
        errors = {};
        parsed = {};

        address = 0;
        code = [];
        var parsedLines = {};
        
        var codes = z80opCodes.get_codes();
        opFragments = codes.opFragments;
        opBlocks = codes.opBlocks;

        var lines = source.split("\n");
        var sourceLines = [];
//        report = "Source has "+lines.length;
        for (var i = 0; i < lines.length; i++) {
            parseLine(lines[i],i,0,parsedLines);
        }
        for (var i = 0; i < lines.length; i++) {
            sourceLines.push({address:address,opcode:lines[i]})
            parseLine(lines[i],i,1,parsedLines);
        }
        return {lines:sourceLines,parsedLines:parsedLines,parsed: parsed,errors: errors,defines: defines,labels: labels,code: code};
    };

    return { assemble: assemble
    };
}]);
