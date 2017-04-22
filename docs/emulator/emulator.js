'use strict';

angular.module('myApp.emulator', ['myApp.services','ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/emulator', {
    templateUrl: 'emulator/emulator.html',
    controller: 'emulator'
  });
}])

.controller('emulator', ['$scope','$interval','$http','z80disasm','z80asm','z80emu','toHexFilter',
    function($scope,$interval,$http,z80disasm,z80asm,z80emu,toHexFilter) {

    $scope.roms = [
        {name:'Atic attack',value:'Aticatac'},
        {name:'Popeye',value:'Popeye'},
        {name:'The hobbit',value:'HOBBIT'}
    ];

    $scope.disassembly = [];
    $scope.disassembly_addresses = {};
    $scope.disassembly_preview = [];

    $scope.breakpoint = '';
    $scope.mem_start = '';
    $scope.watch_mem = '';

    $scope.report = "";
    $scope.code = [];
    $scope.registers = {};
    $scope.parsedLines;

    $scope.event;

    $scope.running = false;

    $scope.code_runner = null;

    $scope.borderPort = 0;
    $scope.soundPort = 0;
    $scope.borderStyle = { 'border-colour': '#000000', 'border-width':'8px', 'border-style': 'solid'};
    var borderColours = ['#000000','#0000CD','#CD0000','#CD00CD','#00CD00','#00CDCD','#CDCD00','#CDCDCD'];
    var mySampleBuffer = [];
    var soundPlaying = false;
    var sampleRate;

    var audioSource;
    var colours = [
        [0x00,0x00,0x00],
        [0x00,0x00,0xCD],
        [0xCD,0x00,0x00],
        [0xCD,0x00,0xCD],
        [0x00,0xCD,0x00],
        [0x00,0xCD,0xCD],
        [0xCD,0xCD,0x00],
        [0xCD,0xCD,0xCD]
    ];
    var colours_bright = [
        [0x00,0x00,0x00],
        [0x00,0x00,0xFF],
        [0xFF,0x00,0x00],
        [0xFF,0x00,0xFF],
        [0x00,0xFF,0x00],
        [0x00,0xFF,0xFF],
        [0xFF,0xFF,0x00],
        [0xFF,0xFF,0xFF]
    ];


    $scope.init = function () {
        $http.get('/source.txt').success(function(data, status, headers, config) {
            var res = z80asm.assemble(data);
            $scope.parsed = res.parsed;
            $scope.parsedLines = res.parsedLines;
            $scope.sourceLines = res.lines;
            $scope.errors = res.errors;
            $scope.labels = res.labels;
            $scope.code = res.code;
            var ram = [].fill(0,0,49152);
            $scope.code = $scope.code.concat(ram);
            z80emu.reset(res.code);

            initAudio();
        });
    };


    $scope.load = function(){
        $scope.stop(true);
        var data = [];
        var oReq = new XMLHttpRequest();
        oReq.open("GET", '/roms/'+$scope.selected_rom+'.Z80', true);
        oReq.responseType = "arraybuffer";

        oReq.onload = function (oEvent) {
          var arrayBuffer = oReq.response; // Note: not oReq.responseText
          if (arrayBuffer) {
            data = new Uint8Array(arrayBuffer);
            $scope.registers.A = data[0];
            $scope.registers.F = data[1];
            $scope.registers.C = data[2];
            $scope.registers.B = data[3];
            $scope.registers.L = data[4];
            $scope.registers.H = data[5];
            $scope.registers.PC = data[6] + (data[7] * 256);
            $scope.registers.SP = data[8] + (data[9] * 256);
            $scope.registers.I = data[10];
            $scope.registers.R = data[11];
            if (data[12] === 255) $scope.registers.mystery = 1;
            else $scope.registers.mystery = data[12];
            $scope.registers.E = data[13];
            $scope.registers.D = data[14];
            $scope.registers.C_ = data[15];
            $scope.registers.B_ = data[16];
            $scope.registers.E_ = data[17];
            $scope.registers.D_ = data[18];
            $scope.registers.L_ = data[19];
            $scope.registers.H_ = data[20];
            $scope.registers.A_ = data[21];
            $scope.registers.F_ = data[22];
            $scope.registers.IY = data[23] + (data[24] * 256);
            $scope.registers.IX = data[25] + (data[26] * 256);
            $scope.registers.int_enabled = data[27];
            $scope.registers.IFF = data[28];
            $scope.registers.mystery = data[29];
            var code = decompress(data,30,true);
            $scope.code = $scope.code.splice(0,16384);
            $scope.code = $scope.code.concat(code);
          }
        };

        oReq.send(null);
        $scope.run();
    };
    function decompress(m_buffer,mbuff_off,m_isCompressed) {
        var i;
//        m_buffer = m_buffer.splice(mbuff_off);
        var m_memory = [];

        var offset = 0; // Current offset into memory
    // TODO: It's 30 just now, but if this is v.2/3 of the file then it's not.. See docs.
        for (i = mbuff_off; i < m_buffer.byteLength; i++) {

            if (m_buffer[i] === 0x00 && m_buffer[i + 1] === 0xED && m_buffer[i + 2] === 0xED && m_buffer[i + 3] === 0x00) {
                break;
            }

            if (i < m_buffer.length - 4) {

                if (m_buffer[i] === 0xED && m_buffer[i + 1] === 0xED && m_isCompressed) {

                    i += 2;
                    var repeat = m_buffer[i++];
                    var value = m_buffer[i];
                    for (var j = 0; j < repeat; j++) {
                        m_memory[offset] = value;
                        offset++;
                    }
                }
                else {
                    m_memory[offset] = m_buffer[i];
                    offset++;
                }
            }
            else {
                m_memory[offset] = m_buffer[i];
                offset++;
            }
        }
        return m_memory;
    }

    $scope.keyDown = function(e) {
        z80emu.keyDown(e);
        e.preventDefault();
    };
    $scope.keyUp = function(e) {
        z80emu.keyUp(e);
        e.stopImmediatePropagation();
    };
    $scope.noKey = function() {
        z80emu.noKey();
    };

    $scope.disassemble = function() {
        $scope.disassembly = [];
        $scope.disasssemblyAddresses = {};
        var i = 0;
        var r;
        var d;
        do {
            $scope.disassembly_addresses[i] = $scope.disassembly.length;
            d = {address: toHexFilter(i)};
            r = z80disasm.disassemble($scope.code ,i);
            if (r.hasOwnProperty('error')) {
                d.opcode = '??';
                i++;
            }
            else {
                d.opcode = r.opcode;
                i += r.length;
            }
            $scope.disassembly.push(d);
        } while (i < 0x4000);
    };

    function updateDisassemblyPreview() {
        $scope.disassembly_preview = [];
        if ($scope.parsedLines.hasOwnProperty($scope.registers.PC)) {
            var start = $scope.parsedLines[$scope.registers.PC];
            for (var i = 0; i < 10; i++) {
                if (i + start < $scope.sourceLines.length) {
                    $scope.disassembly_preview.push($scope.sourceLines[i + start]);
                }
            }
        }
    }

    function handleOutPort(port,t_state) {
        var border = port & 0x7;
        if (border !== $scope.borderPort) {
            $scope.borderStyle['border-color'] =  borderColours[border];
            $scope.borderPort = border;
        }
        var sound = port & 0x10;
        if (sound !== 0) {
            sound = 1;
        }
        sound -= 0.5;
        if (sound !== $scope.soundPort) {
            $scope.soundPort = sound;
            var samples = mySampleBuffer.length;
    //        var start = $scope.t_states;
            for(var i = 0 ; i < samples ; i++) {
    //            start %= mySampleBuffer.length;
                mySampleBuffer[i] = sound;
    //            start++;
            }
        }
    }

    $scope.stepCode = function() {
        var r = z80emu.runInstruction($scope.code);
        $scope.registers = r.registers;
        $scope.report = r.report;
        $scope.next = r.next;
        $scope.breakpoint = toHexFilter(r.step_past);
        handleOutPort(r.ports[254],r.t_states);
        $scope.t_states = r.t_states;
        $scope.copyScreen();
        updateDisassemblyPreview();
    };

    function doRun() {
        var r;
        for (var i = 0; i < 33000 ; i++) {
            r = z80emu.runInstruction($scope.code);
            handleOutPort(r.ports[254],r.t_states);
            $scope.t_states = r.t_states;
        }
        $scope.copyScreen();
    }
    function doMonitor() {
        var watch_mem = null;
        var watch_val = null;
        var breakpoint = null;
        if ($scope.watch_mem !== '') {
            watch_mem = parseInt($scope.watch_mem,16);
            if ((watch_mem >= 0) && (watch_mem <= 65535)) {
                watch_val = $scope.code[watch_mem];
            } else {
                watch_mem = null;
            }
        }
        if ($scope.breakpoint) {
            breakpoint = parseInt($scope.breakpoint,16);
        }
        var r;
        for (var i = 0; i < 33000 ; i++) {
            r = z80emu.runInstruction($scope.code);
            handleOutPort(r.ports[254],r.t_states);
            if (r.report.indexOf('Error') === 0) {
                i = 50000;
                break;
            }
            if (isNaN(r.t_states)) {
                i = 50000;
                break;
            }
            if ((breakpoint !== null) && ($scope.registers.PC === breakpoint)) {
                i = 50000;
                break;
            }
            if ((watch_mem !== null) && ($scope.code[watch_mem] !== watch_val)) {
                watch_val = $scope.code[watch_mem];
                i = 50000;
                break;
            }
            $scope.t_states = r.t_states;
        }
        if( i > 40000) {
            $scope.stop(true);
            $scope.registers = r.registers;
            $scope.t_states = r.t_states;
            $scope.report = r.report;
            $scope.next = r.next;
        }
        $scope.copyScreen();
    };


    $scope.run = function() {
        $scope.running = true;
        $scope.code_runner = $interval(doRun,50);
//        audioSource.start();
    };
    $scope.monitor = function() {
        $scope.running = true;
        $scope.code_runner = $interval(doMonitor,50);
//        audioSource.start();
    };

    $scope.stop = function(noMore) {
        $scope.running = false;
        if (!noMore) {
            var r = z80emu.runInstruction($scope.code);
            $scope.registers = r.registers;
            $scope.t_states = r.t_states;
            $scope.report = r.report;
            $scope.next = r.next;
        }
        if ($scope.code_runner) {
            $interval.cancel($scope.code_runner);
            $scope.code_runner = null;
        }
        audioSource.stop();
        updateDisassemblyPreview();
    };
    $scope.$on('$destroy',function() {
        if ($scope.code_runner) {
            $interval.cancel($scope.code_runner);
            $scope.code_runner = null;
        }
    });

    $scope.reset = function() {
        $scope.stop();
        var r = z80emu.reset();
        $scope.registers = r.registers;
        $scope.soundPort = 0;
        $scope.borderPort = 0;
        updateDisassemblyPreview();
    };


    var initAudio = function () {
        var channels = 1;
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var frameCount = audioCtx.sampleRate * 0.001;   //1.0;
        sampleRate = audioCtx.sampleRate;
    //    var sample = new OscillatorSample();
    // this is how we'll do our sound buffer.

        var myArrayBuffer = audioCtx.createBuffer(channels, frameCount, audioCtx.sampleRate);

        for (var channel = 0; channel < channels; channel++) {
        // This gives us the actual ArrayBuffer that contains the data
            mySampleBuffer = myArrayBuffer.getChannelData(channel);
            for (var i = 0; i < frameCount; i++) {
                // Math.random() is in [0; 1.0]
                // audio needs to be in [-1.0; 1.0]
                mySampleBuffer[i] = 0; //       Math.random() * 2 - 1;
            }
        }
        audioSource = audioCtx.createBufferSource();
        // set the buffer in the AudioBufferSourceNode
        audioSource.buffer = myArrayBuffer;
        audioSource.loop = true;
        // connect the AudioBufferSourceNode to the
        // destination so we can hear the sound
        audioSource.connect(audioCtx.destination);
        audioSource.start();
    };

    $scope.playSound = function() {
        // start the source playing
        audioSource.start();
        soundPlaying = !soundPlaying;
    };


    $scope.copyScreen = function() {
        var dx = new Date();
        var flash = ((dx.getMilliseconds() & 0x200) >> 2);
        var c = document.getElementById("myCanvas");
        var ctx = c.getContext("2d");
        var id = ctx.createImageData(1,1); // only do this once per page
        var d  = id.data;                        // only do this once per page
        d[3] = 255;
        var paper,ink;
        var offs;
        for (var y = 0x00; y < 0xc0; y++) {
            for(var x = 0; x < 0x100; x++) {
                if((x & 7) === 0) { // time to get an attribute?
                    var attr = $scope.code[0x5800 + (x / 8) + ((y & 0xf8) << 2)];
                    if (attr & 0x40) {
                        ink = colours_bright[attr & 7];
                        paper = colours_bright[(attr >> 3) & 0x7];
                    } else {
                        ink = colours[attr & 0x7];
                        paper = colours[(attr >> 3) & 0x7];
                    }
                    if( flash & attr ) {
                        var i1 = ink;
                        ink = paper;
                        paper = i1;
                    }
                }
                offs = 0x4000 + ((y & 0x7) << 8);
                offs |= ((y  & 0xc0) << 5);
                offs |= ((y  & 0x38) << 2);
                offs |= ((x >> 3) & 0x1f);
                var pixel = $scope.code[offs] & (0x80 >> (x & 7));
                if (pixel === 0) {
                    d[0] = paper[0]; d[1] = paper[1]; d[2] = paper[2];
                } else {
                    d[0] = ink[0]; d[1] = ink[1]; d[2] = ink[2];
                }
                ctx.putImageData( id, x, y );
            }
        }
    };
    $scope.init();
    $scope.run();



}]);