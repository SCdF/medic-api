var controller = require('../../controllers/records'),
    db = require('../../db'),
    utils = require('../utils'),
    sinon = require('sinon');

exports.tearDown = function (callback) {
  utils.restore(db.request, db.getPath);
  callback();
};

exports['create returns error when unsupported content type'] = function(test) {
  test.expect(2);
  var req = sinon.stub(db, 'request');
  controller.create({
    message: 'test',
    from: '+123'
  }, 'jpg', function(err) {
    test.equals(err.message, 'Content type not supported.');
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['create form returns formated error from string'] = function(test) {
  test.expect(2);
  var req = sinon.stub(db, 'request').callsArgWith(1, 'icky');
  controller.create({
    message: 'test',
    from: '+123'
  }, 'urlencoded', function(err) {
    test.equals(err, 'icky');
    test.equals(req.callCount, 1);
    test.done();
  });
};

exports['create form returns error if missing required field'] = function(test) {
  test.expect(2);
  var req = sinon.stub(db, 'request');
  controller.create({
    message: 'test'
  }, 'urlencoded', function(err) {
    test.equals(err.message, 'Missing required field: from');
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['create json returns formated error from string'] = function(test) {
  test.expect(2);
  var req = sinon.stub(db, 'request').callsArgWith(1, 'icky');
  var body = {
    _meta: {
      from: '+123',
      form: 'A'
    }
  };
  controller.create(body, 'json', function(err) {
    test.equals(err, 'icky');
    test.equals(req.callCount, 1);
    test.done();
  });
};

exports['create json returns error if missing _meta property'] = function(test) {
  test.expect(2);
  var req = sinon.stub(db, 'request');
  var body = { name: 'bob' };
  controller.create(body, 'json', function(err) {
    test.equal(err.message, 'Missing _meta property.');
    // request should never be called if validation does not 
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['create json does not call request if validation fails'] = function(test) {
  test.expect(1);
  var req = sinon.stub(db, 'request');
  var body = {};
  controller.create(body, 'json', function() {
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['create form does not call request if validation fails'] = function(test) {
  test.expect(1);
  var req = sinon.stub(db, 'request');
  var body = {};
  controller.create(body, 'urlencoded', function() {
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['create form returns success'] = function(test) {
  test.expect(11);
  var req = sinon.stub(db, 'request').callsArgWith(1, null, { payload: { success: true, id: 5 }});
  var getPath = sinon.stub(db, 'getPath').returns('medic');
  controller.create({
    message: 'test',
    from: '+123',
    unwanted: ';-- DROP TABLE users'
  }, 'urlencoded', function(err, results) {
    test.equals(err, null);
    test.equals(results.success, true);
    test.equals(results.id, 5);
    test.equals(req.callCount, 1);
    test.equals(getPath.callCount, 1);
    var requestOptions = req.firstCall.args[0];
    test.equals(requestOptions.path, 'medic/add');
    test.equals(requestOptions.method, 'POST');
    test.equals(requestOptions.content_type, 'application/x-www-form-urlencoded');
    test.equals(requestOptions.form.message, 'test');
    test.equals(requestOptions.form.from, '+123');
    test.equals(requestOptions.form.unwanted, undefined);
    test.done();
  });
};

exports['create json returns success'] = function(test) {
  test.expect(10);
  var req = sinon.stub(db, 'request').callsArgWith(1, null, { payload: { success: true, id: 5 }});
  var getPath = sinon.stub(db, 'getPath').returns('medic');
  controller.create({
    _meta: {
      form: 'test',
      from: '+123',
      unwanted: ';-- DROP TABLE users'
    }
  }, 'json', function(err, results) {
    test.equals(err, null);
    test.equals(results.success, true);
    test.equals(results.id, 5);
    test.equals(req.callCount, 1);
    test.equals(getPath.callCount, 1);
    var requestOptions = req.firstCall.args[0];
    test.equals(requestOptions.path, 'medic/add');
    test.equals(requestOptions.method, 'POST');
    test.equals(requestOptions.body._meta.form, 'test');
    test.equals(requestOptions.body._meta.from, '+123');
    test.equals(requestOptions.body._meta.unwanted, undefined);
    test.done();
  });
};