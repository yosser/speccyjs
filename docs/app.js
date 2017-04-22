'use strict';

var myModule = angular.module('myApp.services', []);
myModule = angular.module('myApp.directives', []);
myModule = angular.module('myApp.filters', []);

// Declare app level module which depends on views, and components
var myApp = angular.module('myApp', [
  'ngRoute',
  'myApp.services',
  'myApp.directives',
  'myApp.filters',
  'myApp.emulator',
  'mgcrea.ngStrap' ,'mgcrea.ngStrap.modal','mgcrea.ngStrap.tooltip','mgcrea.ngStrap.helpers.dimensions'
]).
config(['$routeProvider', function($routeProvider) {
  $routeProvider.otherwise({redirectTo: '/emulator'});
}]);
myApp.controller('MyController', ['$scope',function($scope) {
}]);