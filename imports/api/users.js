// QLICKER
// Author: Enoch T <me@enocht.am>
// 
// users.js: JS related to user collection

import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'

/*
 * profile: {
 *  firstname: '',
 *  lastname: '',
 *  roles: ['student', 'professor', 'admin']
 * } 
 */

if (Meteor.isServer) {
  Meteor.publish("userData", function () {
    if (this.userId) {
      return Meteor.users.find({_id: this.userId});
    } else {
      this.ready();
    }
  });
}

// this method is not secure. Make sure to only publish data that user has access to
Meteor.userHasRole = function(user, role) {
  return user && user.profile.roles.indexOf(role) != -1
}