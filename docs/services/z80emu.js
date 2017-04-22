'use strict';


// this retrieves the existing module
var myModule = angular.module('myApp.services');

myModule.factory('z80emu',['z80disasm',function(z80disasm){

/*
7th bit Signed flag (S). Determines whether the accumulator ended up positive (1), or negative (0). This flag assumes that the accumulator is signed.
6th bit Zero Flag (Z). Determines whether the accumulator is zero or not.
5th bit The 5th bit of the last 8-bit instruction that altered flags.
4th bit Half-carry (H). Is set when the least-significant nibble overflows.
3th bit The 3rd bit of the last 8-bit instruction that altered flags.
2nd bit Parity/Overflow (P/V). Either holds the results of parity or overflow. It's value depends on the instruction used. Is used for signed integers.
1st bit Add/Subtract (N). Determines what the last instruction used on the accumulator was. If it was add, the bit is reset (0). If it was subtract, the bit is set (1).
0th bit Carry (C). Determines if there was an overflow or not. Note that it checks for unsigned values. The carry flag is also set if a subtraction results in a
*/
    var memory = [];

    var registers = { };
// 0xfe low 3 bits are border colour then 8 = ear, 0x10 mic.
    var ports = {} ;

    var inPorts = [];

    var cycles = 0;
    var t_states;
    // too scared to use const yet - define the flag bits
    var Sf = 0x80;
    var Zf = 0x40;
    var Hf = 0x10;
    var PVf = 0x04;
    var Nf = 0x02;
    var Cf = 0x01;
    // define complements of the flag bits
    var Sfm = Sf ^ 0xFF;
    var Zfm = Zf ^ 0xFF;
    var Hfm = Hf ^ 0xFF;
    var PVfm = PVf ^ 0xFF;
    var Nfm = Nf ^ 0xFF;
    var Cfm = Cf ^ 0xFF;

    function reset() {
        registers.A = 0;
        registers.F = 0;
        registers.SP = 0;
        registers.PC = 0;
        registers.B = 0;
        registers.C = 0;
        registers.D = 0;
        registers.E = 0;
        registers.H = 0;
        registers.L = 0;
        registers.B_ = 0;
        registers.C_ = 0;
        registers.D_ = 0;
        registers.E_ = 0;
        registers.H_ = 0;
        registers.L_ = 0;
        registers.IX = 0;
        registers.IY = 0;
        registers.A_ = 0;
        registers.F_ = 0;
        registers.I = 0;
        registers.R = 0;
        registers.int_enabled = false;
        registers.int_mode = 0;
        cycles = 0;
        inPorts = [];
        for (var i = 0; i < 256; i++) {
            inPorts.push(0x1f);
        }
        t_states = 0;
        return {registers:registers};
    };
    var simple_timings = {RR:{'RR':11,HL:11},HL:{'RR':11,HL:11},RX:{'HL':15,'RR':15,'RX':15},
        'R':{'R': 4,'n': 7, '(RR)':7,'(RR+n)':19}
        };

    function setZeroFlag() {
        registers.F |= Zf;
    }
    function resetZeroFlag() {
        registers.F &= Zfm;
    }
    function setCarryFlag() {
        registers.F |= Cf;
    }
    function resetCarryFlag() {
        registers.F &= Cfm;
    }
    function adjustSignFlag() {
        (registers.A & 0x80) ? registers.F |= Sf : registers.F &= Sfm;
    }
    function resetSignFlag() {
        registers.F &= Sfm;
    }
    function setSignFlag() {
        registers.F |= Sf;
    }
    function setNFlag() {
        registers.F |= Nf;
    }
    function resetNFlag() {
        registers.F &= Nfm;
    }
    function setHFlag() {
        registers.F |= Hf;
    }
    function resetHFlag() {
        registers.F &= Hfm;
    }
    function setPVFlag() {
        registers.F |= PVf;
    }
    function resetPVFlag() {
        registers.F &= PVfm;
    }
    function calcPVFlag(v){
        var c = 0;
        (v & 0x1) && c++;
        (v & 0x2) && c++;
        (v & 0x4) && c++;
        (v & 0x8) && c++;
        (v & 0x10) && c++;
        (v & 0x20) && c++;
        (v & 0x40) && c++;
        (v & 0x80) && c++;
        (c & 1) ? registers.F |= PVf : registers.F &= PVfm;
    }

    function getFromReg(v,inst) {
        var val,addrType;
        switch(v) {
            case 'A':
            case 'B':
            case 'C':
            case 'D':
            case 'E':
            case 'H':
            case 'L':
                val = registers[v];
                addrType = 'R';
                break;
            case 'I':
            case 'R':
                val = registers[v];
                addrType = 'IR';
                break;
            case 'IX':
            case 'IY':
            case 'SP':
                val = registers[v];
                addrType = 'RX';
                break;
            case '(BC)':
            case '(DE)':
            case '(HL)':
                val = memory[(registers[v.charAt(1)] * 256) + registers[v.charAt(2)]];
                addrType = '(RR)';
                break;
            case '(SP)':
                val = memory[registers.SP] + (memory[(registers.SP + 1) & 0xffff] * 256);
                addrType = '(SP)';
                break;
            case 'HL':
                val = (registers[v.charAt(0)] * 256) + registers[v.charAt(1)];
                addrType = 'HL';
                break;
            case 'BC':
            case 'DE':
            case 'AF':
                val = (registers[v.charAt(0)] * 256) + registers[v.charAt(1)];
                addrType = 'RR';
                break;
            case 'AF_':
                val = (registers.A_ * 256) + registers.F_;
                addrType = 'RR';
                break;
            default:
                if ((v.charAt(0) === '(') && (v.charAt(v.length-1) === ')')) {
                    var loc;
                    var vs = v.substring(1,v.length-1).split('+');
                    if (vs.length > 1) {
                        if (inst.val1 < 0x80) {
                            loc = registers[vs[0]] + inst.val1;
                        } else {
                            loc = registers[vs[0]] - (0x100 - inst.val1);
                        }
                         addrType = '(RR+n)';
                    }
                    else {
                        loc = parseInt(vs[0],16);
                        addrType = '(nn)';
                    }
                    if (inst.descriptor[2] === 'B') {
                        val = memory[loc];
                        if (addrType === '(nnn)') {
                            addrType = '(n)';
                        }
                    } else {
                        val = memory[loc] + (memory[loc+1] * 256);
                    }
                }
                else {
                    val = inst.val1;
                    if ((inst.descriptor[2] === 'BB')||(inst.descriptor[2] === 'W')) {
                        addrType = 'nn';
                    } else {
                        addrType = 'n';
                    }
                }
        }
        return [val,addrType];
    }
    function setToLocation(v,val,inst,size) {
        var loc,addrType;
        switch(v) {
            case 'A':
            case 'B':
            case 'C':
            case 'D':
            case 'E':
            case 'H':
            case 'L':
                registers[v] = val & 0xff;
                addrType = 'R';
                break;
            case 'I':
            case 'R':
                registers[v] = val & 0xff;
                addrType = 'IR';
                break;
            case 'IX':
            case 'IY':
                registers[v] = val & 0xffff;
                addrType = 'RX';
                break;
            case 'SP':
                registers[v] = val & 0xffff;
                addrType = 'RR';
                break;
            case '(BC)':
            case '(DE)':
            case '(HL)':
                loc = (registers[v.charAt(1)] * 256) + registers[v.charAt(2)];
                addrType = '(RR)';
                setMem(loc,val);
                break;
            case '(SP)':
                loc = registers.SP;
                setMem(loc,[val & 0xff,(val >> 0x8) & 0xff]);
                addrType = '(SP)';
                break;
            case 'HL':
                addrType = 'HL';
                registers[v.charAt(0)] = (val >> 8) & 0xff;
                registers[v.charAt(1)] = val & 0xff;
                break;
            case 'BC':
            case 'DE':
            case 'AF':
                addrType = 'RR';
                registers[v.charAt(0)] = (val >> 8) & 0xff;
                registers[v.charAt(1)] = val & 0xff;
                break;
            case 'AF_':
                registers.A_ = (val >> 8) & 0xff;
                registers.F_ = val & 0xff;
                addrType = 'RR';
                break;
            default:
                if ((v.charAt(0) === '(') && (v.charAt(v.length-1) === ')')) {
                    var vs = v.substring(1,v.length-1).split('+');
                    if (vs.length > 1) {
                        if (inst.val1 < 0x80) {
                            loc = registers[vs[0]] + inst.val1;
                        } else {
                            loc = registers[vs[0]] - (0x100 -inst.val1);
                        }
                         addrType = '(RR+n)';
                    }
                    else {
                        loc = parseInt(vs[0],16);
                         addrType = '(nn)';
                    }
                    if (inst.descriptor[2] === 'BB') {
                        setMem(loc,inst.val2);
                    }
                    else if ((inst.descriptor[2] === 'B') || (size === 1)) {
                        setMem(loc,val);
                        if (addrType === '(nn)') {
                            addrType = '(n)';
                        }
                    } else {
                        setMem(loc,[val,val >> 8]);
                    }
                }
        }
        return addrType;
    }
    function doLoad(v,inst) {
        var addrTo;
        var v1 = v.split(',');
        var val = getFromReg(v1[1],inst);
        if (isRegPair(v1[1])) {
            addrTo = setToLocation(v1[0],val[0],inst,2); // inst 2 = 'B', 'W' etc.
        } else {
            addrTo = setToLocation(v1[0],val[0],inst,1); // inst 2 = 'B', 'W' etc.
        }
        var ldt_states = {
            'R': {'R': 4,'n': 7,'(RR)': 7,'(nn)':13,'(RR+n)': 19,'IR':9},
            'HL': {'nn':10,'(nn)':16},
            'RR': {'nn':10,'(nn)':20,'HL':6,'IR':10},
            'RX': {'nn':14,'(nn)':20},
            '(RR)': {'R': 7,'n': 10},
            '(n)':{'R':13},
            '(nn)': {'R': 13,'HL':16,'RR':20,'IR':20,'SP':20,'RX':20},
            '(RR+n)': {'R': 19,'n':19,'nn':19},
            'IR': {'R': 9}
        };
        t_states += ldt_states[addrTo][val[1]];
    }
    function isRegPair(v) {
        return ['BC','DE','HL','IX','IY','SP'].indexOf(v) !== -1;
    }


    function doIn(v,inst) {
        var port_index;
        var v1 = v.split(',');
        var val = 0;
        var port;
        if (v1[1] === '(C)') {
            port = registers[v1[1].charAt(1)];
            port_index = registers.B;
           t_states += 12;
        } else {
            port = parseInt(v1[1].substring(1,3),16);
            port_index = registers.A;
           t_states += 11;
        }
        if (port === 0xFE) { // it's keyboard
// value it's always IN x,(C)...
            if(typeof inPorts[port_index] !== 'undefined') {
                val = inPorts[port_index];
                if (val !== 31) {
                    var t = 99;
                }
            }
        }
        registers[v1[0]] = val;
    }

    function doOut(v,inst) {
        var v1 = v.split(',');
        var port;
        if (inst.descriptor[2] === 'B') {
            port = inst.val1;
           t_states += 11;
        } else {
            port = registers[v1[0]];
           t_states += 12;
        }
// out (0xfe) 0x10 = sound.
/*        if ((ports[0xfe] & 0x10) !== (registers[v1[1]] & 0x10 )) {
            // sound is fl
        } */
        ports[port] = registers[v1[1]];
    }


    function doInc(v,inst) {
        var val = getFromReg(v,inst);
        val[0]++;
        if((val[1] !== 'R') && (val[1] !== '(RR)') && (val[1] !== '(RR+n)')) {
            val[0] &= 0xFFFF;
            if (v.charAt(0) === 'I' ) {
                t_states += 10;
            } else {
                t_states += 6;
            }
        } else {
            val[0] &= 0xFF;
            (val[0] & 0xf) ? registers.F &= Hfm : registers.F |= Hf;
            (val[0] === 0x80) ? setPVFlag() : resetPVFlag();
            (val[0] & 0x80) ? setSignFlag() : resetSignFlag();
            val[0] ? resetZeroFlag() : setZeroFlag();
            resetNFlag();
            var timings = {'R':4,'(RR)':11 ,'(RR+n)': 23};
            t_states += timings[val[1]];
        }
        setToLocation(v,val[0],inst);
    }
    function doDec(v,inst) {
        var val = getFromReg(v,inst);
        val[0]--;
        if((val[1] !== 'R') && (val[1] !== '(RR)') && (val[1] !== '(RR+n)')) {
            val[0] &= 0xFFFF;
            if (v.charAt(0) === 'I' ) {
                t_states += 10;
            } else {
                t_states += 6;
            }
        } else {
            val[0] &= 0xFF;
            (val[0] & 0xf === 0xf) ? registers.F |= Hf : registers.F &= Hfm;
            (val[0] & 0xf) ? registers.F &= Hfm : registers.F |= Hf;
            (val[0] === 0x7f) ? setPVFlag() : resetPVFlag();
            (val[0] & 0x80) ? setSignFlag() : resetSignFlag();
            val[0] ? resetZeroFlag() : setZeroFlag();
            setNFlag();
            var timings = {'R':4, '(RR)':11 ,'(RR+n)': 23};
            t_states += timings[val[1]];
        }
        setToLocation(v,val[0],inst);
    }
    function doEx(v,inst) {
// ex AF,AF is a special case - trap that
        if (v === 'AF,AF') {
            v += '_';
        }
        var v1 = v.split(',');
        var r1a = getFromReg(v1[0],inst);
        var r2a = getFromReg(v1[1],inst);
        setToLocation(v1[0],r2a[0],inst);
        setToLocation(v1[1],r1a[0],inst);
        if ((r1a[1] === 'RR') && (r2a[0] === 'HL')) {
            t_states += 4;
        } else if (r1a[1] === '(SP}') {
            if (r2a[1] === 'HL') {
                t_states += 19;
            } else {
                t_states += 23;
            }
        }
    }
    function doAdd(v,inst) {
        var v1 = v.split(',');
        if (v1.length === 1) {
            v1.unshift('A');  // check for simple 'ADD B' style syntax
        }
        var val1 = getFromReg(v1[0],inst);
        var val2 = getFromReg(v1[1],inst);
        var val =  val1[0] + val2[0];
        if (v1[0].length === 1) {
            if ((val1[0] & 0xf) + (val2[0] & 0xf) > 0xf) {
                registers.F |= Hf;
            } else {
                registers.F &= Hfm;
            }
            (val > 0xFF) ? setCarryFlag() : resetCarryFlag();
            val &= 0xFF;
        } else {
            (val > 0xFFFF) ? setCarryFlag() : resetCarryFlag();
            val &= 0xFFFF;
        }
        val ? resetZeroFlag() : setZeroFlag();
        setToLocation(v1[0],val,inst);
        adjustSignFlag();
        t_states += simple_timings[val1[1]][val2[1]];
    }
    function doAdc(v,inst) {
        var v1 = v.split(',');
        if (v1.length === 1) {
            v1.unshift('A');  // check for simple 'ADC B' style syntax
        }
        var val1 = getFromReg(v1[0],inst);
        var val2 = getFromReg(v1[1],inst);
        val2[0] += (registers.F & Cf);
        var val = val1[0] + val2[0];
        if (v1[0].length === 1) {
            if ((val1[0] & 0xf) + (val2[0] & 0xf) > 0xf) {
                registers.F |= Hf;
            } else {
                registers.F &= Hfm;
            }
            (val > 0xFF) ? setCarryFlag() : resetCarryFlag();
            val &= 0xFF;
        } else {
            (val > 0xFFFF) ? setCarryFlag() : resetCarryFlag();
            val &= 0xFFFF;
        }
        val ? resetZeroFlag() : setZeroFlag();
        setToLocation(v1[0],val,inst);
        adjustSignFlag();
        if (val1[1] === 'HL') {
            t_states += 15;
        } else {
            t_states += simple_timings['R'][val2[1]];
        }
    }
    function doSub(v,inst) {
        var v1 = v.split(',');
        if (v1.length === 1) {
            v1.unshift('A');  // check for simple 'SUB B' style syntax
        }
        var val1 = getFromReg(v1[0],inst);
        var val2 = getFromReg(v1[1],inst);

        var val =  val1[0] - val2[0];
        (val < 0) ? setCarryFlag() : resetCarryFlag();
        if (v1[0].length === 1) {
            if (((val1[0] & 0xf) - (val1[0] & 0xf)) < 0) {
                registers.F |= Hf;
            } else {
                registers.F &= Hfm;
            }
            val &= 0xFF;
        } else {
            val &= 0xFFFF;
        }
        val ? resetZeroFlag() : setZeroFlag();
        setToLocation(v1[0],val,inst);
        adjustSignFlag();
        t_states += simple_timings['R'][val2[1]];
    }
    function doSbc(v,inst) {
        var v1 = v.split(',');
        if (v1.length === 1) {
            v1.unshift('A');  // check for simple 'SBC B' style syntax
        }
        var val1 = getFromReg(v1[0],inst);
        var val2 = getFromReg(v1[1],inst);
        val2[0] += (registers.F & Cf);
        var val =  val1[0] - val2[0];
        (val < 0) ? setCarryFlag() : resetCarryFlag();
        if (v1[0].length === 1) {
            if (((val1[0] & 0xf) - (val1[0] & 0xf)) < 0) {
                registers.F |= Hf;
            } else {
                registers.F &= Hfm;
            }
            val &= 0xFF;
        } else {
            val &= 0xFFFF;
        }
        val ? resetZeroFlag() : setZeroFlag();
        setToLocation(v1[0],val,inst);
        adjustSignFlag();
        if (val1[1] === 'HL') {
            t_states += 15;
        } else {
            t_states += simple_timings['R'][val2[1]];
        }
    }


    function doAnd(v,inst) {
        var val = getFromReg(v,inst);
        registers.A &= val[0];
        adjustSignFlag();
        registers.A ? resetZeroFlag() : setZeroFlag();
        resetNFlag();
        resetCarryFlag();
        t_states += simple_timings['R'][val[1]];
//        calcPVFlag(registers.A); - need overflow calc - not parity
    }
    function doOr(v,inst) {
        var val = getFromReg(v,inst);
        registers.A |=  val[0];
        adjustSignFlag();
        registers.A ? resetZeroFlag() : setZeroFlag();
        resetNFlag();
        resetCarryFlag();
        t_states += simple_timings['R'][val[1]];
//        calcPVFlag(registers.A);- need overflow calc - not parity
    }
    function doXor(v,inst) {
        var val = getFromReg(v,inst);
        registers.A ^= val[0];
        registers.A  ? resetZeroFlag() : setZeroFlag();
        adjustSignFlag();
        resetCarryFlag();
        resetNFlag();
        calcPVFlag(registers.A);
        t_states += simple_timings['R'][val[1]];
// todo adjust R, adjust t states
    }

    function doCp(v,inst) {
        var val =  getFromReg(v,inst);
        (registers.A < val[0]) ? setCarryFlag() : resetCarryFlag();
        var val2 = registers.A - val[0];
        adjustSignFlag();
        (val2 === 0) ? setZeroFlag() : resetZeroFlag();
//        calcPVFlag(registers.A);- need overflow calc - not parity
        setNFlag();
        t_states += simple_timings['R'][val[1]];
    }

    /*
     * from http://www.z80.info/z80syntx.htm#DAA
     *
--------------------------------------------------------------------------------
|           | C Flag  | HEX value in | H Flag | HEX value in | Number  | C flag|
| Operation | Before  | upper digit  | Before | lower digit  | added   | After |
|           | DAA     | (bit 7-4)    | DAA    | (bit 3-0)    | to byte | DAA   |
|------------------------------------------------------------------------------|
|           |    0    |     0-9      |   0    |     0-9      |   00    |   0   |
|   ADD     |    0    |     0-8      |   0    |     A-F      |   06    |   0   |
|           |    0    |     0-9      |   1    |     0-3      |   06    |   0   |
|   ADC     |    0    |     A-F      |   0    |     0-9      |   60    |   1   |
|           |    0    |     9-F      |   0    |     A-F      |   66    |   1   |
|   INC     |    0    |     A-F      |   1    |     0-3      |   66    |   1   |
|           |    1    |     0-2      |   0    |     0-9      |   60    |   1   |
|           |    1    |     0-2      |   0    |     A-F      |   66    |   1   |
|           |    1    |     0-3      |   1    |     0-3      |   66    |   1   |
|------------------------------------------------------------------------------|
|   SUB     |    0    |     0-9      |   0    |     0-9      |   00    |   0   |
|   SBC     |    0    |     0-8      |   1    |     6-F      |   FA    |   0   |
|   DEC     |    1    |     7-F      |   0    |     0-9      |   A0    |   1   |
|   NEG     |    1    |     6-F      |   1    |     6-F      |   9A    |   1   |
|------------------------------------------------------------------------------|
    */


    function doDaa() {
        var operations = {
// sub
            N: {
                C: {
                    H: [
                        [0x6,0xf,0x6,0xf,0x9a,1]
                    ],
                    NH: [
                        [0x7,0xf,0x0,0x9,0xa0,1]
                    ]
                },
                NC: {
                    H: [
                        [0x0,0x8,0x6,0xf,0xfa,0]
                    ],
                    NH: [
                        [0x0,0x9,0x0,0x9,0x00,0]
                    ]
                }
            },
// add
            P: {
// no carry
                NC: {
// no half carry
                    NH: [
                        [0x0,0x9,0x0,0x9,0x00,0],
                        [0x0,0x8,0xa,0xf,0x06,0],
                        [0xa,0xf,0x0,0x9,0x60,1],
                        [0x9,0xf,0xa,0xf,0x66,1],
                        [0x0,0x2,0x0,0x9,0x60,1],
                        [0x0,0x2,0xa,0xf,0x66,1]
                    ],
// got half carry
                    H: [
                        [0x0,0x9,0x0,0x3,0x06,0],
                        [0xa,0xf,0x0,0x3,0x66,1],
                        [0x0,0x3,0x0,0x3,0x66,1]
                    ]
                },
                C: {
                    NH: [
                        [0xa,0xf,0x0,0x3,0x66,1],
                        [0x0,0x3,0x0,0x3,0x66,1]
                    ],
                    H: [
                        [0xa,0xf,0x0,0x3,0x66,1],
                        [0x0,0x3,0x0,0x3,0x66,1]
                    ]
                }
            }
        };

        var k1 = (registers.F & Nf) ? 'N' : 'P';
        var k2 = (registers.F & Cf) ? 'C' : 'NC';
        var k3 = (registers.F & Hf) ? 'H' : 'NH';

        var adjArrays = operations[k1][k2][k3];
        var nl = registers.A & 0xf;
        var nh = (registers.A >> 4) & 0xf;
        for(var i = 0; i < adjArrays.length; i++) {
            if ((nh >= adjArrays[i][0]) && (nh <= adjArrays[i][1]) &&
                (nl >= adjArrays[i][2]) && (nl <= adjArrays[i][3])) {
                registers.A = (registers.A + adjArrays[i][4]) & 0xff;
                (adjArrays[i][5]) ? registers.F |= Cf : registers.F &= Cfm;
                break;
            }
        }
        t_states += 4;
    }


    function doExx() {
        var tr = {B: registers.B_,C: registers.C_,D: registers.D_,E: registers.E_,H: registers.H_,L: registers.L_};
        registers.B_ = registers.B;
        registers.C_ = registers.C;
        registers.D_ = registers.D;
        registers.E_ = registers.E;
        registers.H_ = registers.H;
        registers.L_ = registers.L;
        registers.B = tr.B;
        registers.C = tr.C;
        registers.D = tr.D;
        registers.E = tr.E;
        registers.H = tr.H;
        registers.L = tr.L;
        t_states += 4;
    }

    function doRrca() {
        var cf = registers.A & 1;
        registers.A >>= 1;
        if ( cf ) { registers.A |= 0x80; }
        cf ? setCarryFlag(): resetCarryFlag();
        resetNFlag();
        t_states += 4;
    }
// 8 bit rotation
    function doRlca() {
        var cf = registers.A & 0x80;
        registers.A <<= 1;
        registers.A &= 0xff;
        if ( cf ) { registers.A |= 0x01; }
        cf ? setCarryFlag(): resetCarryFlag();
        resetNFlag();
        t_states += 4;
    }
// 9 bit rotation
    function doRla() {
        var cf = registers.A & 0x80;
        registers.A <<= 1;
        registers.A &= 0xff;
        if ( registers.F & Cf ) { registers.A |= 0x01; }
        cf ? setCarryFlag(): resetCarryFlag();
        resetNFlag();
        t_states += 4;
    }
    function doRra() {
        var cf = registers.A & 0x01;
        registers.A >>= 1;
        if ( registers.F & Cf ) { registers.A |= 0x80; }
        cf ? setCarryFlag(): resetCarryFlag();
        resetNFlag();
        t_states += 4;
    }

    function doSla(v,inst) {
        var val =  getFromReg(v,inst);
        var cf = val[0] & 0x80;
        val[0] = (val[0] << 1) & 0xff;
        setToLocation(v,val[0],inst);
        (val[0] & 0x80) ? setSignFlag() : resetSignFlag();
        val[0] ? resetZeroFlag() : setZeroFlag();
        resetNFlag();
        calcPVFlag(val[0]);
        cf ? setCarryFlag(): resetCarryFlag();
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }

    function doSra(v,inst) {
        var val =  getFromReg(v,inst);
        var sf = val[0] & 0x80;
        var cf = val[0] & 0x01;
        val[0] = (val[0] >> 1) | sf;
        setToLocation(v,val[0],inst);
        sf ? setSignFlag() : resetSignFlag();
        val[0] ? resetZeroFlag() : setZeroFlag();
        resetNFlag();
        calcPVFlag(val[0]);
        cf ? setCarryFlag(): resetCarryFlag();
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doSrl(v,inst) {
        var val =  getFromReg(v,inst);
        var cf = val[0] & 0x01;
        val[0] >>= 1;
        setToLocation(v,val[0],inst);
        resetSignFlag();
        val[0] ? resetZeroFlag() : setZeroFlag();
        resetNFlag();
        calcPVFlag(val[0]);
        cf ? setCarryFlag(): resetCarryFlag();
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doSll(v,inst) {
        var val =  getFromReg(v,inst);
        var cf = val[0] & 0x80;
        val[0] = (val[0] << 1) & 0xff;
        setToLocation(v,val[0],inst);
        val[0] ? resetZeroFlag() : setZeroFlag();
        cf ? setCarryFlag(): resetCarryFlag();
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doRrc(v,inst) {
        var val =  getFromReg(v,inst);
        var cf = val[0] & 0x01;
        val[0] >>= 1;
        if ( cf ) { val[0] |= 0x80; }
        setToLocation(v,val[0],inst);
        (val[0] & 0x80) ? setSignFlag() : resetSignFlag();
        val[0] ? resetZeroFlag() : setZeroFlag();
        cf ? setCarryFlag(): resetCarryFlag();
        resetNFlag();
        calcPVFlag(val[0]);
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doRlc(v,inst) {
        var val =  getFromReg(v,inst);
        var cf = val[0] & 0x80;
        val[0] = (val[0] << 1) & 0xff;
        if ( cf ) { val[0] |= 0x01; }
        setToLocation(v,val[0],inst);
        (val[0] & 0x80) ? setSignFlag() : resetSignFlag();
        val[0] ? resetZeroFlag() : setZeroFlag();
        cf ? setCarryFlag(): resetCarryFlag();
        resetNFlag();
        calcPVFlag(val[0]);
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doRr(v,inst) {
        var val =  getFromReg(v,inst);
        var v1 = val[0] & 0x1;
        val[0] >>= 1;
        if ( registers.F & Cf ) { val[0] |= 0x80; }
        setToLocation(v,val[0],inst);
        (val[0] & 0x80) ? setSignFlag() : resetSignFlag();
        val[0] ? resetZeroFlag() : setZeroFlag();
        resetNFlag();
        v1 ? setCarryFlag() : resetCarryFlag();
        calcPVFlag(val[0]);
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doRl(v,inst) {
        var val =  getFromReg(v,inst);
        var v1 = val[0] & 0x80;
        val[0] = ((val[0] << 1) & 0xFF);
        if ( registers.F & Cf ) { val[0] |= 0x01; }
        setToLocation(v,val[0],inst);
        (val[0] & 0x80) ? setSignFlag() : resetSignFlag();
        val[0] ? resetZeroFlag() : setZeroFlag();
        resetNFlag();
        v1 ? setCarryFlag() : resetCarryFlag();
        calcPVFlag(val[0]);
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doRld() {
        var m = memory[(registers.H * 256) + registers.L];
        var m4 = (m & 0xf0) >> 4;
        var ac4 = registers.A & 0xf;
        registers.A = (registers.A & 0xf0) | m4;
        m = ((m << 4) & 0xf0) | ac4;
        setMem((registers.H * 256) + registers.L,m);
        (registers.A & 0x80) ? setSignFlag() : resetSignFlag();
        registers.A ? resetZeroFlag() : setZeroFlag();
        calcPVFlag(registers.A);
        resetNFlag();
        t_states += 18;
    }
    function doRrd() {
        var m = memory[(registers.H * 256) + registers.L];
        var m4 = m & 0xf;
        var ac4 = (registers.A & 0xf) << 4;
        registers.A = (registers.A & 0xf0) | m4;
        m = ((m >> 4) & 0xf) | ac4;
        setMem((registers.H * 256) + registers.L,m);
        (registers.A & 0x80) ? setSignFlag() : resetSignFlag();
        registers.A ? resetZeroFlag() : setZeroFlag();
        calcPVFlag(registers.A);
        resetNFlag();
        t_states += 18;
    }


    function doIm(v) {
        registers.int_mode = parseInt(v);
        t_states += 8;
    }

/* Repeats the instruction LDD (Does a LD (DE),(HL) and decrements each of DE, HL, and BC) until BC=0.
 * Note that if BC=0 before the start of the routine, it will try loop around until BC=0 again.
 */

    function doLDDR() {
        resetNFlag();
        resetHFlag();

        var BC = (registers.B * 256) + registers.C;
        var DE = (registers.D * 256) + registers.E;
        var HL = (registers.H * 256) + registers.L;
        t_states += 16 + (21 * BC);
        do {
            setMem(DE,memory[HL]);
            DE = (DE - 1) & 0xFFFF;
            HL = (HL - 1) & 0xFFFF;
            BC = (BC - 1) & 0xFFFF;
        } while(BC !== 0);
        // TODO allow interrupts
        registers.B = 0; registers.C = 0;
        registers.D = (DE >> 8) & 0xFF; registers.E = DE & 0xFF;
        registers.H = (HL >> 8) & 0xFF; registers.L = HL & 0xFF;
        resetNFlag();
        resetHFlag();
        resetPVFlag();
    }
    function doLDD() {
        var BC = (registers.B * 256) + registers.C;
        var DE = (registers.D * 256) + registers.E;
        var HL = (registers.H * 256) + registers.L;
        setMem(DE,memory[HL]);
        DE = (DE - 1) & 0xFFFF;
        HL = (HL - 1) & 0xFFFF;
        BC = (BC - 1) & 0xFFFF;
        registers.B = (BC >> 8) & 0xFF; registers.C = BC & 0xFF;
        registers.D = (DE >> 8) & 0xFF; registers.E = DE & 0xFF;
        registers.H = (HL >> 8) & 0xFF; registers.L = HL & 0xFF;
        t_states += 16;
        resetNFlag();
        resetHFlag();
        BC ? setPVFlag() : resetPVFlag();
    }

    function doLDIR() {
        var BC = (registers.B * 256) + registers.C;
        var DE = (registers.D * 256) + registers.E;
        var HL = (registers.H * 256) + registers.L;
        t_states += 16 + (21 * BC);
        do {
            setMem(DE,memory[HL]);
            DE = (DE + 1) & 0xFFFF;
            HL = (HL + 1) & 0xFFFF;
            BC = (BC - 1) & 0xFFFF;
        } while(BC !== 0);
        // TODO allow interrupts
        registers.B = 0; registers.C = 0;
        registers.D = (DE >> 8) & 0xFF; registers.E = DE & 0xFF;
        registers.H = (HL >> 8) & 0xFF; registers.L = HL & 0xFF;
        resetNFlag();
        resetHFlag();
        resetPVFlag();
    }
    function doLDI() {
        var BC = (registers.B * 256) + registers.C;
        var DE = (registers.D * 256) + registers.E;
        var HL = (registers.H * 256) + registers.L;
        setMem(DE,memory[HL]);
        DE = (DE + 1) & 0xFFFF;
        HL = (HL + 1) & 0xFFFF;
        BC = (BC - 1) & 0xFFFF;
        registers.B = (BC >> 8) & 0xFF; registers.C = BC & 0xFF;
        registers.D = (DE >> 8) & 0xFF; registers.E = DE & 0xFF;
        registers.H = (HL >> 8) & 0xFF; registers.L = HL & 0xFF;
        t_states += 16;
        resetNFlag();
        resetHFlag();
        BC ? setPVFlag() : resetPVFlag();
    }

    function doCpl() {
        registers.A ^= 0xff;
        setNFlag();
        t_states += 4;
    }
    function doNeg() {
        registers.A ? setCarryFlag() : resetCarryFlag();
        (registers.A === 0x80) ? setPVFlag() : resetPVFlag();
        registers.A = (0 - registers.A) & 0xff;
        registers.A ? setZeroFlag() : resetZeroFlag();
        if ((0 - (registers.A & 0xf)) < 0) {
            // this wil always be set?
            registers.F |= Hf;
        } else {
            registers.F &= Hfm;
        }
        adjustSignFlag();
        setNFlag();
        t_states += 8;
    }

    function doBit(v,inst) {
        var v1 = v.split(',');
        var mask = 1 << v1[0];
        var val = getFromReg(v1[1],inst);
        val[0]  &= mask;
        (val[0]) ? resetZeroFlag() : setZeroFlag();
        var timings = {R:8,'(RR)':12,'(RR+n)':20};
        t_states += timings[val[1]];
    }
    function doRes(v,inst) {
        var v1 = v.split(',');
        var mask = (1 << v1[0]) ^ 0xff;
        var val = getFromReg(v1[1],inst);
        val[0] &= mask;
        setToLocation(v1[1],val[0],inst);
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doSet(v,inst) {
        var v1 = v.split(',');
        var mask = 1 << v1[0];
        var val = getFromReg(v1[1],inst);
        val[0] |=  mask;
        setToLocation(v1[1],val[0],inst);
        var timings = {R:8,'(RR)':15,'(RR+n)':23};
        t_states += timings[val[1]];
    }
    function doPush(v,inst) {
        doPushX(v);
    }
    function doPop(v,inst) {
        doPopX(v);
    }

    function checkFlag(f) {
        var v = false;
        switch(f) {
            case 'C':
                v = ((registers.F & Cf) !== 0);
                break;
            case 'NC':
                v = ((registers.F & Cf) === 0);
                break;
            case 'Z':
                v = ((registers.F & Zf) !== 0);
                break;
            case 'NZ':
                v = ((registers.F & Zf) === 0);
                break;
            case 'M':
                v = ((registers.F & Sf) !== 0);
                break;
            case 'P':
                v = ((registers.F & Sf) === 0);
                break;
            case 'PO':
                v = ((registers.F & PVf) === 0);
                break;
            case 'PE':
                v = ((registers.F & PVf) !== 0);
                break;
        }
        return v;
    }
    function doPushX(reg) {
        switch(reg){
            case 'BC':
            case 'DE':
            case 'HL':
            case 'AF':
                registers.SP = (registers.SP - 1) & 0xffff;
                setMem(registers.SP,[registers[reg.charAt(0)]]); // ie B
                registers.SP = (registers.SP - 1) & 0xffff;
                setMem(registers.SP,[registers[reg.charAt(1)]]); // ie C
                t_states += 11;
                break;
            case 'IX':
            case 'IY':
                t_states += 15;
            case 'PC':
                registers.SP = (registers.SP - 1) & 0xffff;
                setMem(registers.SP,[(registers[reg] >> 8 )& 0xFF]); // I
                registers.SP = (registers.SP - 1) & 0xffff;
                setMem(registers.SP,[registers[reg] & 0xFF]);   // X
                break;
            default:
                registers.SP = (registers.SP - 1) & 0xffff;
                setMem(registers.SP,[(reg >> 8 )& 0xFF]);
                registers.SP = (registers.SP - 1) & 0xffff;
                setMem(registers.SP,[reg & 0xFF]);
                break;
        }
        registers.SP &= 0xFFFF;
    }
    function doPopX(reg) {
        switch(reg){
            case 'BC':
            case 'DE':
            case 'HL':
            case 'AF':
                registers[reg.charAt(1)] = memory[registers.SP]; // C
                registers.SP = (registers.SP + 1) & 0xffff;
                registers[reg.charAt(0)] = memory[registers.SP]; //B
                registers.SP = (registers.SP + 1) & 0xffff;
                t_states += 10;
                break;
            case 'IX':
            case 'IY':
                t_states += 14;
            case 'PC':
                var r = memory[registers.SP];  // X
                registers.SP = (registers.SP + 1) & 0xffff;
                registers[reg] = (memory[registers.SP] * 256) + r; // I
                registers.SP = (registers.SP + 1) & 0xffff;
        }
    }

    function doDJNZ(v,param,inst) {
        registers.B = (registers.B - 1) & 0xff;
        if (registers.B !== 0) {
            t_states += 13;
            registers.PC = param;
        } else {
            t_states += 8;
            registers.PC += inst.length;
        }
    }
    function doRst(v,param,inst) {
        registers.PC += inst.length;
        doPushX('PC');
        registers.PC = parseInt(v.substring(0,v.length -1),16);
        t_states += 11;
    }
    function doCall(v,param,inst){
        registers.PC += inst.length;
        var v1 = v.split(',');
        if (v1.length > 1) {
            if(!checkFlag(v1[0])) {
                t_states += 10;
                return;
            }
        }
        doPushX('PC');
        registers.PC = param;
        t_states += 17;
    }
    function doJP(v,param,inst) {
        var v1 = v.split(',');
        if (v1.length > 1) {
            if(!checkFlag(v1[0])) {
                t_states += 10;
                registers.PC += inst.length;
                return;
            }
        } else {
            if (v === '(HL)') {
                t_states += 4;
                param = registers.H * 256 + registers.L;
            }
            else if ((v === '(IX)')||(v === '(IY)')) {
                t_states += 8;
                param = registers[v.substring(1,3)];
            }
            else {
                t_states += 10;
            }
        }
        registers.PC = param;
    }

    function doJR(v,param,inst) {
        var v1 = v.split(',');
        if (v1.length > 1) {
            if(!checkFlag(v1[0])) {
                t_states += 7;
                registers.PC += inst.length;
                return;
            }
        }
        t_states += 12;
        registers.PC = param;
    }
    function doRet(v,param,inst) {
        if (v !== 'RET') {
            if(!checkFlag(v)) {
                t_states += 5;
                registers.PC += inst.length;
                return;
            }
            t_states++;
        }
        inst.length = 0;
        t_states += 10;
        doPopX('PC');
    }

    function doReti(v,param,inst) {
       inst.length = 0;
        t_states += 14;
        doPopX('PC');
    }

    function doRetn(v,param,inst) {
       inst.length = 0;
        t_states += 14;
        doPopX('PC');
    }


    var elemental_instructions = {
        ADC: doAdc,
        ADD: doAdd,
        AND: doAnd,
        BIT: doBit,
        CP: doCp,
        EX: doEx,
        DEC: doDec,
        INC: doInc,
        IM: doIm,
        IN: doIn,
        LD: doLoad,
        OR: doOr,
        OUT: doOut,
        PUSH: doPush,
        POP: doPop,
        RES: doRes,
        RR: doRr,
        RL: doRl,
        RLC: doRlc,
        RRC: doRrc,
        SBC: doSbc,
        SET: doSet,
        SLA: doSla,
        SRA: doSra,
        SRL: doSrl,
        SLL: doSll,
        SUB: doSub,
        XOR: doXor
    };

    var simple_instructions = {
        CCF: function() { registers.F ^= Cf; resetNFlag(); t_states += 4; },
        CPL: doCpl,
        DI: function() {  registers.int_enabled = false; t_states += 4; },
        DAA: doDaa,
        EI: function() { registers.int_enabled = true;  t_states += 4;},
        EXX: doExx,
        HALT: function() {t_states += 4; registers.PC -= 1;},
        LDDR: doLDDR,
        LDIR: doLDIR,
        LDD: doLDD,
        LDI: doLDI,
        NEG: doNeg,
        NOP: function() {t_states += 4; },
        RET: doRet,
        RETI: doReti,
        RETN: doRetn,
        RLA: doRla,
        RLCA: doRlca,
        RLD: doRld,
        RRA: doRra,
        RRCA: doRrca,
        RRD: doRrd,
        SCF: function() {setCarryFlag(); resetNFlag(); t_states += 4; }
    };

    var jump_instructions = {
        DJNZ: doDJNZ,
        JR : doJR,
        JP : doJP,
        CALL : doCall,
        RET : doRet,
        RST: doRst
    };

    var complex_instructions = {
        'OUT (' : outOp
    };

    function setMem(addr,v) {
        if(v instanceof Array) {
            for(var i = 0; i < v.length; i++ ) {
                if(addr > 0x3fff) {
                    memory[addr++] = v[i] & 0xff;
                }
            }
        }
        else {
            if(addr > 0x3fff) {
                memory[addr] = v & 0xff;
            }
        }
    }

    function outOp(v,p) {
        var port;
        var breakdown = v.descriptor;
        if (breakdown[2] === 'B') {
            port = p;
        }
        switch(breakdown[3]) {
            case '),A':
                ports[port] = registers.A;
        }
    }

    var report = "";

    function runInstruction(buffer) {
        memory = buffer;
        var inst = z80disasm.disassemble(buffer,registers.PC);
// trigger an interrupt.
        if (((cycles++ % 10000) === 0 ) && registers.int_enabled) {
            registers.int_enabled = false;
            if(inst.opcode === 'HALT') {
               registers.PC += inst.length;
            }
 //
            switch (registers.int_mode) {
                case 0:
                    inst = {opcode: "RST 38H", length: 0};
                    break;
                case 1:
                    inst = {opcode: "RST 38H", length: 0};
                    break;
                case 2:
                    doPushX('PC');
                    registers.PC = registers.I * 256;
                    inst = {opcode: "NOP", length: 0};
                    break;
            }
        } else {
            if (inst.error) {
                report = inst.error;
            }
            report = inst.opcode;
        }
        var v = inst.hasOwnProperty('opcode') ? inst.opcode.split(' ') : ['Error'];
        if (v.length === 1) {
            if (simple_instructions.hasOwnProperty(inst.opcode)) {
                simple_instructions[inst.opcode](v[0],null,inst);
                registers.PC += inst.length;
            } else {
                report = "Error: I don't know how to do: "+inst.opcode;
            }
        }
        else if (v.length === 2)  {
            if(elemental_instructions.hasOwnProperty(v[0])) {
                elemental_instructions[v[0]](v[1],inst);
                registers.PC += inst.length;
            }
            else {
// something like this.
                var param = null;
                if (inst.hasOwnProperty('val1')) {
                    param = inst.val1;
                }
                if (jump_instructions.hasOwnProperty(v[0])) {
                    jump_instructions[v[0]](v[1],param,inst);
                }
                else if (typeof inst.descriptor === 'undefined') {
                    report = "Error: I don't know how to do: "+inst.opcode;
                }
                else {
                    if (complex_instructions.hasOwnProperty(inst.descriptor[1])) {
                        complex_instructions[inst.descriptor[1]](inst,param);
                        registers.PC += inst.length;
                    } else {
                        report = "Error: I don't know how to do: "+inst.opcode;
                    }
                }
            }
        }
        var inst = z80disasm.disassemble(buffer,registers.PC);
        return {registers:registers,t_states: t_states,report:report,next: inst.opcode,step_past:inst.length + registers.PC,ports:ports};
    }
/*
; ---------------------------------------------------------------------------
;
;         0     1     2     3     4 -Bits-  4     3     2     1     0
; PORT                                                                    PORT
;
; F7FE  [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]  |  [ 6 ] [ 7 ] [ 8 ] [ 9 ] [ 0 ]   EFFE
;  ^                                   |                                   v
; FBFE  [ Q ] [ W ] [ E ] [ R ] [ T ]  |  [ Y ] [ U ] [ I ] [ O ] [ P ]   DFFE
;  ^                                   |                                   v
; FDFE  [ A ] [ S ] [ D ] [ F ] [ G ]  |  [ H ] [ J ] [ K ] [ L ] [ ENT ] BFFE
;  ^                                   |                                   v
; FEFE  [SHI] [ Z ] [ X ] [ C ] [ V ]  |  [ B ] [ N ] [ M ] [sym] [ SPC ] 7FFE
;  ^     $27                                                 $18           v
; Start                                                                   End
;        00100111                                            00011000
*/
    var keys = {f7: [49,50,51,52,53],
        ef:[48,57,56,55,54],
        fb:[81,87,69,82,84],
        df:[80,79,73,85,89],
        fd:[65,83,68,70,71],
        bf:[13,76,75,74,72],
        fe:[0,90,88,67,86],
        '7f':[32,0,77,78,66]
    };

    function translateKeyEvent(e) {
        var i;
        var keyscans = [];
        if (e.shiftKey || e.key === 'Shift') {
            keyscans.push(0xfe);
            keyscans.push(0x01);
        }
        if (e.altKey || e.key === 'Alt') {
            keyscans.push(0x7f);
            keyscans.push(0x02);
        }
// bloody inefficient way to find key
        for (var k in keys) {
            if (keys.hasOwnProperty(k)) {
                for(i = 0; i < keys[k].length; i++) {
                    if (keys[k][i] === e.keyCode) {
                        keyscans.push(parseInt(k,16));
                        keyscans.push(1 << i);
                        return keyscans;
                    }
                }
            }
        }
        return keyscans;
    }
    function keyDown(e) {
        var k = translateKeyEvent(e);
        for(var i = 0; i < k.length; i+= 2) {
            inPorts[k[i]] &= (0xFF ^ k[i+1]);
            inPorts[0] &= (0xFF ^ k[i+1]);
        }
    }
    function keyUp(e) {
        var k = translateKeyEvent(e);
        for(var i = 0; i < k.length; i+= 2) {
            inPorts[k[i]] |= k[i+1];
            inPorts[0] |= k[i+1];
        }
    }
    function noKey(){
        for(var k in keys) {
            if (keys.hasOwnProperty(k)) {
                inPorts[parseInt(k,16)] = 0xff;
            }
        }
    }

    return{
        reset: reset,
        runInstruction: runInstruction,
        keyDown: keyDown,
        keyUp: keyUp,
        noKey: noKey
    };
}]);


