'use strict';

// this retrieves the module
var myModule = angular.module('myApp.filters');
myModule.filter('isSet', function() {
    return function(input,bit) {
        if (typeof(input) !== 'undefined') {
            return input & bit ? 1: 0;
        }
        return '0';
    };
});
