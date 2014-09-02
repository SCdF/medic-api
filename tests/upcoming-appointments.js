var controller = require('../controllers/upcoming-appointments'),
    db = require('../db'),
    moment = require('moment'),
    sinon = require('sinon');

var clock;

exports.setUp = function(callback) {
  clock = sinon.useFakeTimers();
  callback();
};

exports.tearDown = function (callback) {
  clock.restore();
  if (db.fti.restore) {
    db.fti.restore();
  }
  callback();
};

exports['get returns errors'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti').callsArgWith(2, 'bang');
  controller.get({}, function(err, results) {
    test.equals(err, 'bang');
    test.equals(fti.callCount, 1);
    test.done();
  });
};

exports['get returns empty if no registrations'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti').callsArgWith(2, null, {
    rows: []
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 0);
    test.equals(fti.callCount, 1);
    test.done();
  });
};

exports['get returns zero if all registrations have delivered'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti');
  fti.onFirstCall().callsArgWith(2, null, {
    rows: [
      { 
        doc: { 
          patient_id: 1,
          scheduled_tasks: [ {
            group: 1,
            due: moment().toISOString()
          } ]
        } 
      },
      { 
        doc: { 
          patient_id: 2,
          scheduled_tasks: [ {
            group: 1,
            due: moment().toISOString()
          } ]
        } 
      }
    ]
  });
  fti.onSecondCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 1 } },
      { doc: { patient_id: 2 } }
    ]
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 0);
    test.equals(fti.callCount, 2);
    test.done();
  });
};

exports['get returns zero if all registrations have visits'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti');
  fti.onFirstCall().callsArgWith(2, null, {
    rows: [
      { 
        doc: { 
          patient_id: 1,
          scheduled_tasks: [ {
            group: 1,
            due: moment().toISOString()
          } ]
        } 
      },
      { 
        doc: { 
          patient_id: 2,
          scheduled_tasks: [ {
            group: 1,
            due: moment().toISOString()
          } ]
        } 
      }
    ]
  });
  fti.onSecondCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 1 } }
    ]
  });
  fti.onThirdCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 2 } }
    ]
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 0);
    test.equals(fti.callCount, 3);
    test.done();
  });
};

exports['get ignores registrations with no upcoming appointments'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti');
  fti.onFirstCall().callsArgWith(2, null, {
    rows: [
      { 
        doc: { 
          patient_id: 1,
          scheduled_tasks: []
        } 
      },
      { 
        doc: { 
          patient_id: 2,
          scheduled_tasks: [ {
            group: 1,
            due: moment().subtract(13, 'days').toISOString()
          } ]
        } 
      },
      { 
        doc: { 
          patient_id: 3,
          scheduled_tasks: [ {
            group: 1,
            due: moment().add(6, 'days').toISOString()
          } ]
        } 
      }
    ]
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 0);
    test.equals(fti.callCount, 1);
    test.done();
  });
};

exports['get ignores registrations with upcoming appointment reminders'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti');
  fti.onFirstCall().callsArgWith(2, null, {
    rows: [
      { 
        doc: { 
          patient_id: 1,
          scheduled_tasks: []
        } 
      },
      { 
        doc: { 
          patient_id: 2,
          scheduled_tasks: [ {
            group: 1,
            due: moment().subtract(13, 'days').toISOString()
          }, {
            group: 1,
            due: moment().toISOString()
          } ]
        } 
      },
      { 
        doc: { 
          patient_id: 3,
          scheduled_tasks: [ {
            group: 1,
            due: moment().add(6, 'days').toISOString()
          } ]
        } 
      }
    ]
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 0);
    test.equals(fti.callCount, 1);
    test.done();
  });
};

exports['get returns all registrations with upcoming appointments'] = function(test) {
  test.expect(14);
  var fti = sinon.stub(db, 'fti');
  var today = moment();
  fti.onFirstCall().callsArgWith(2, null, {
    rows: [
      { 
        doc: { 
          patient_id: 1,
          patient_name: 'sarah',
          form: 'R',
          reported_date: today.clone().subtract(10, 'weeks').toISOString(),
          related_entities: { clinic: { id: 'x' } },
          scheduled_tasks: [ {
            group: 1,
            due: today.toISOString()
          }, {
            group: 2,
            due: moment().add(4, 'weeks').toISOString()
          } ]
        } 
      },
      { 
        doc: { 
          patient_id: 2,
          patient_name: 'sally',
          form: 'P',
          lmp_date: today.clone().subtract(14, 'weeks').toISOString(),
          related_entities: { clinic: { id: 'y' } },
          scheduled_tasks: [ {
            group: 1,
            due: today.toISOString()
          } ]
        } 
      }
    ]
  });
  fti.onSecondCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 4 } }
    ]
  });
  fti.onThirdCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 5 } }
    ]
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 2);

    test.equals(results[0].patient_id, 1);
    test.equals(results[0].patient_name, 'sarah');
    test.equals(results[0].clinic.id, 'x');
    test.equals(results[0].weeks.number, 10);
    test.equals(results[0].weeks.approximate, true);
    test.equals(results[0].date.toISOString(), today.toISOString());

    test.equals(results[1].patient_id, 2);
    test.equals(results[1].patient_name, 'sally');
    test.equals(results[1].clinic.id, 'y');
    test.equals(results[1].weeks.number, 12);
    test.equals(results[1].weeks.approximate, undefined);
    test.equals(results[1].date.toISOString(), today.toISOString());

    test.equals(fti.callCount, 3);
    test.done();
  });
};