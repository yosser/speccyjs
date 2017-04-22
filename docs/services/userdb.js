'use strict';

// this retrieves the module
var myModule = angular.module('myApp.services');

myModule.factory('userDB',['$http','$q',function($http,$q) {
// even though r is essentially a promise, it returns successa and failure funcitons
// with different names that a regular promise, so do something about that
    function toPromise(r) {
        var deferred = $q.defer();
        r.success(deferred.resolve);
        r.error(deferred.reject);
        return deferred.promise;
    }
   function getUsers() {    
        var r = $http.get('/api/users');
        return toPromise(r);
   }
   function addUser(user) {
        var r = $http({method:'POST',url: '/api/users', data: user});
        return toPromise(r);
   }
   function updateUser(id,user) {
        var r = $http({method:'PUT',url: '/api/users/'+id, data: user});
        return toPromise(r);
   }
   function deleteUser(id) {
        var r = $http({method:'DELETE',url:'/api/users/'+id});
        return toPromise(r);
   }   
   return { 
        getUsers: getUsers,
        addUser: addUser,
        updateUser: updateUser,
        deleteUser: deleteUser   
   };
}]);
