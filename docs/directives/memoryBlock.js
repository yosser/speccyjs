'use strict';

// this retrieves the existing module
var myModule = angular.module('myApp.directives');


myModule.directive('memoryBlock',['$filter',function($filter) {    
    var output;
    return {
        transclude: false,
        template: getBlock,
        controller: function($scope) {
            $scope.getCode = function(x) {                
                return $scope.code[(x + parseInt($scope.mem_start,16)) & 0xffff];
            };
            $scope.getAddr = function(x) {
                return (parseInt($scope.mem_start,16) + x) & 0xffff;
            }
        }
    };  
    
    function getRow(idx,length) {
        var row = "<TD style='background-color:yellow'; ng-bind='getAddr("+idx+") | toHex' ></td>";
        var x;
        for(var i = 0; i < length; i++){
            x = idx + i;
            row += "<td ng-bind='getCode("+x+") | toHex'></td>";
        }
        return "<tr>"+row+"</tr>";
    }

    function getBlock() {    
        output = "<table>";
        for(var i = 0; i < 0x200; i += 0x20) {
            output += getRow(i,0x20);
        }
        output += "</table>";
        return output;
    }
 
}]);
