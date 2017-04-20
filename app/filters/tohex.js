'use strict';

// this retrieves the module
var myModule = angular.module('myApp.filters');
myModule.filter('toHex', function() {
    return function(input) {
        if (typeof(input) !== 'undefined') {
            return input.toString(16).toUpperCase();
        }
        return '0';
    };
});