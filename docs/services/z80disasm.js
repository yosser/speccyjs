'use strict';

// this retrieves the existing module
var myModule = angular.module('myApp.services');

myModule.factory('z80disasm',['z80opCodes', function(z80opCodes) {
        var opFragmentsI;
        var opBlocksI;
        function disassemble(fragment,offset) {
            var codes = z80opCodes.get_codes();
            opFragmentsI = codes.opFragmentsI;
            opBlocksI = codes.opBlocksI;            
            
            var instruction_address = offset;
//            prepare_disassembly_tables();
            var idx = Number(fragment[offset]);
            var idx2 = Number(fragment[offset+1]);
            var idx3 = Number(fragment[offset+3]); // note +3 is intentional!
            if (!(opBlocksI[idx] === undefined)) {
                if (typeof opBlocksI[idx] === 'string') {
                    return {opcode:opBlocksI[idx],length:1};
                }
                if (!(opBlocksI[idx][idx2] === undefined)) {
                    return {opcode:opBlocksI[idx][idx2],length:2};
                }
            } 
            if(!(opFragmentsI[idx] === undefined)) {
                var opdescriptor = null;
                var l = 1;
                var IX = false;
                if (opFragmentsI[idx].length === 1) {
                    opdescriptor = opFragmentsI[idx][0];
                }
                else if (!(opFragmentsI[idx][idx2] === undefined)) {
                    if ((idx === 0xdd || idx === 0xfd) && (idx2 === 0xcb)) {
                        IX = true;
                        opdescriptor = opFragmentsI[idx][idx2][idx3];                    
                        l = 3;
                    } else {
                        opdescriptor = opFragmentsI[idx][idx2];
                        l = 2;
                    }
                }
                var x = null;
                var x1 = null;
                if (opdescriptor) {
                    var opcode = opdescriptor[1];
                    switch (opdescriptor[2]) {
                        case 'W':
                           x = fragment[offset+l] + (fragment[offset+l+1] * 256);
                           l += 2;
                           break;
                        case 'B':
                           if (IX) {
                                x = fragment[offset+2];                       
                           } else {
                                x = fragment[offset+l];
                           }
                           l += 1;
                           break;
                        case 'R':
                            x = fragment[offset+l];
                            if (x & 0x80) {
                                x |= 0xff00;
                            }
                            l += 1;
                            x += instruction_address + l;
                            x &= 0xffff;
                            break;
                        case 'BB':
                            x = fragment[offset+l];
                            x1 = fragment[offset+l+1];
                            l += 2;
                            break;
                    }
                    var c = opcode.charAt(opcode.length -1);
                    if ((c !== ',') && (c !== '(') && (c !== '+')) {
                        opcode += " ";
                    }
                    opcode += x.toString(16);
                    if (opdescriptor.length > 3) {
                        opcode += opdescriptor[3];
                    }
                    if (opdescriptor[2] === 'BB') {
                        opcode += x1.toString(16);
                    }
                    var r = {opcode:opcode,length:l,descriptor:opdescriptor};
                    if (x !== null) {
                        r.val1 = x;
                    }
                    if (x1 !== null) {
                        r.val2 = x1;
                    }
                    return r;
                }
            }
            return {error: "Unknown"};
        }
        return{
            disassemble: disassemble
        };        
    }
]);
