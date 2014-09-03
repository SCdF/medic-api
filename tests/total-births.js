var controller = require('../controllers/total-births'),
    db = require('../db'),
    sinon = require('sinon');

exports.tearDown = function (callback) {
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

exports['get returns zero if no registrations and no delivery reports'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti').callsArgWith(2, null, {
    rows: []
  });
  controller.get({}, function(err, results) {
    test.equals(results.count, 0);
    test.equals(fti.callCount, 2);
    test.done();
  });
};

exports['get returns total births count'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti');
  fti.onFirstCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 1 } },
      { doc: { patient_id: 4 } },
      { doc: { patient_id: 6 } }
    ]
  });
  fti.onSecondCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 6 } },
      { doc: { patient_id: 2 } },
      { doc: { patient_id: 3 } }
    ]
  });
  controller.get({}, function(err, results) {
    test.equals(results.count, 5);
    test.equals(fti.callCount, 2);
    test.done();
  });
};