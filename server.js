var _ = require('underscore'),
    bodyParser = require('body-parser'),
    express = require('express'),
    morgan = require('morgan'),
    http = require('http'),
    moment = require('moment'),
    path = require('path'),
    app = express(),
    db = require('./db'),
    config = require('./config'),
    auth = require('./auth'),
    scheduler = require('./scheduler'),
    AuditProxy = require('./audit-proxy'),
    migrations = require('./migrations'),
    translations = require('./translations'),
    target = 'http://' + db.settings.host + ':' + db.settings.port,
    proxy = require('http-proxy').createProxyServer({ target: target }),
    proxyForAuditing = require('http-proxy').createProxyServer({ target: target }),
    login = require('./controllers/login'),
    activePregnancies = require('./controllers/active-pregnancies'),
    upcomingAppointments = require('./controllers/upcoming-appointments'),
    missedAppointments = require('./controllers/missed-appointments'),
    upcomingDueDates = require('./controllers/upcoming-due-dates'),
    highRisk = require('./controllers/high-risk'),
    totalBirths = require('./controllers/total-births'),
    missingDeliveryReports = require('./controllers/missing-delivery-reports'),
    deliveryLocation = require('./controllers/delivery-location'),
    visitsCompleted = require('./controllers/visits-completed'),
    visitsDuring = require('./controllers/visits-during'),
    monthlyRegistrations = require('./controllers/monthly-registrations'),
    monthlyDeliveries = require('./controllers/monthly-deliveries'),
    exportData = require('./controllers/export-data'),
    messages = require('./controllers/messages'),
    records = require('./controllers/records'),
    forms = require('./controllers/forms'),
    fti = require('./controllers/fti'),
    createDomain = require('domain').create,
    staticResources = /\/(templates|static)\//,
    appcacheManifest = /manifest\.appcache/,
    pathPrefix = '/' + db.settings.db + '/',
    appPrefix = pathPrefix + '_design/' + db.settings.ddoc + '/_rewrite/';

http.globalAgent.maxSockets = 100;

// requires content-type application/json header
var jsonParser = bodyParser.json({limit: '32mb'});

// requires content-type application/x-www-form-urlencoded header
var formParser = bodyParser.urlencoded({limit: '32mb', extended: false});

app.use(morgan('combined', {
  immediate: true
}));

app.use(function(req, res, next) {
  var domain = createDomain();
  domain.on('error', function(err) {
    console.error('UNCAUGHT EXCEPTION!');
    console.error(err);
    serverError(err, req, res);
    domain.dispose();
    process.exit(1);
  });
  domain.enter();
  next();
});

app.get('/', function(req, res) {
  if (req.headers.accept === 'application/json') {
    // couchdb request - let it go
    proxy.web(req, res);
  } else {
    // redirect to the app path - redirect to _rewrite
    res.redirect(appPrefix);
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get(pathPrefix + 'login', login.get);
app.post(pathPrefix + 'login', jsonParser, login.post);

app.all(appPrefix + 'update_settings/*', function(req, res) {
  // don't audit the app settings
  proxy.web(req, res);
});
app.all(pathPrefix + '_revs_diff', function(req, res) {
  // don't audit the _revs_diff
  proxy.web(req, res);
});
app.all(pathPrefix + '_local/*', function(req, res) {
  // don't audit the _local docs
  proxy.web(req, res);
});

var audit = function(req, res) {
  var ap = new AuditProxy();
  ap.on('error', function(e) {
    serverError(e, req, res);
  });
  ap.on('not-authorized', function() {
    notLoggedIn(req, res);
  });
  ap.audit(proxyForAuditing, req, res);
};

var auditPath = pathPrefix + '*';
app.put(auditPath, audit);
app.post(auditPath, audit);
app.delete(auditPath, audit);

app.get('/setup/poll', function(req, res) {
  var p = require('./package.json');
  res.json({
    ready: true,
    handler: 'medic-api', version: p.version,
    detail: 'All required services are running normally'
  });
});

app.all('/setup', function(req, res) {
  res.status(503).send('Setup services are not currently available');
});

app.all('/setup/password', function(req, res) {
  res.status(503).send('Setup services are not currently available');
});

app.all('/setup/finish', function(req, res) {
  res.status(200).send('Setup services are not currently available');
});

app.get('/api/info', function(req, res) {
  var p = require('./package.json');
  res.json({ version: p.version });
});

app.get('/api/auth/:path', function(req, res) {
  auth.checkUrl(req, function(err, output) {
    if (err) {
      return serverError(err, req, res);
    }
    if (output.status >= 400 && output.status < 500) {
      res.status(403).send('Forbidden');
    } else {
      res.json(output);
    }
  });
});

var handleAnalyticsCall = function(req, res, controller) {
  auth.check(req, 'can_view_analytics', req.query.district, function(err, ctx) {
    if (err) {
      return error(err, req, res);
    }
    controller.get({ district: ctx.district }, function(err, obj) {
      if (err) {
        return serverError(err, req, res);
      }
      res.json(obj);
    });
  });
};

app.get('/api/active-pregnancies', function(req, res) {
  handleAnalyticsCall(req, res, activePregnancies);
});

app.get('/api/upcoming-appointments', function(req, res) {
  handleAnalyticsCall(req, res, upcomingAppointments);
});

app.get('/api/missed-appointments', function(req, res) {
  handleAnalyticsCall(req, res, missedAppointments);
});

app.get('/api/upcoming-due-dates', function(req, res) {
  handleAnalyticsCall(req, res, upcomingDueDates);
});

app.get('/api/high-risk', function(req, res) {
  handleAnalyticsCall(req, res, highRisk);
});

app.get('/api/total-births', function(req, res) {
  handleAnalyticsCall(req, res, totalBirths);
});

app.get('/api/missing-delivery-reports', function(req, res) {
  handleAnalyticsCall(req, res, missingDeliveryReports);
});

app.get('/api/delivery-location', function(req, res) {
  handleAnalyticsCall(req, res, deliveryLocation);
});

app.get('/api/visits-completed', function(req, res) {
  handleAnalyticsCall(req, res, visitsCompleted);
});

app.get('/api/visits-during', function(req, res) {
  handleAnalyticsCall(req, res, visitsDuring);
});

app.get('/api/monthly-registrations', function(req, res) {
  handleAnalyticsCall(req, res, monthlyRegistrations);
});

app.get('/api/monthly-deliveries', function(req, res) {
  handleAnalyticsCall(req, res, monthlyDeliveries);
});

var formats = {
  xml: {
    extension: 'xml',
    contentType: 'application/vnd.ms-excel'
  },
  csv: {
    extension: 'csv',
    contentType: 'text/csv'
  },
  json: {
    extension: 'json',
    contentType: 'application/json'
  },
  zip: {
    extension: 'zip',
    contentType: 'application/zip'
  }
};

var getExportPermission = function(type) {
  if (type === 'audit') {
    return 'can_export_audit';
  }
  if (type === 'feedback') {
    return 'can_export_feedback';
  }
  if (type === 'contacts') {
    return 'can_export_contacts';
  }
  if (type === 'logs') {
    return 'can_export_server_logs';
  }
  return 'can_export_messages';
};

app.get([
  '/api/v1/export/:type/:form?',
  '/' + db.getPath() + '/export/:type/:form?'
], function(req, res) {
  auth.check(req, getExportPermission(req.params.type), req.query.district, function(err, ctx) {
    if (err) {
      return error(err, req, res, true);
    }
    req.query.type = req.params.type;
    req.query.form = req.params.form || req.query.form;
    req.query.district = ctx.district;
    exportData.get(req.query, function(err, obj) {
      if (err) {
        return serverError(err, req, res);
      }
      var format = formats[req.query.format] || formats.csv;
      var filename = req.params.type + '-' +
                     moment().format('YYYYMMDDHHmm') +
                     '.' + format.extension;
      res
        .set('Content-Type', format.contentType)
        .set('Content-Disposition', 'attachment; filename=' + filename)
        .send(obj);
    });
  });
});

app.get('/api/v1/fti/:view', function(req, res) {
  auth.check(req, 'can_view_data_records', null, function(err) {
    if (err) {
      return error(err, req, res);
    }
    auth.check(req, 'can_view_unallocated_data_records', null, function(err, ctx) {
      var queryOptions = _.pick(req.query, 'q', 'schema', 'sort', 'skip', 'limit', 'include_docs');
      queryOptions.allocatedOnly = !!err;
      fti.get(req.params.view, queryOptions, ctx && ctx.district, function(err, result) {
        if (err) {
          return serverError(err.message, req, res);
        }
        res.json(result);
      });
    });
  });
});

app.get('/api/v1/messages', function(req, res) {
  auth.check(req, ['can_view_data_records','can_view_unallocated_data_records'], null, function(err, ctx) {
    if (err) {
      return error(err, req, res, true);
    }
    var opts = _.pick(req.query, 'limit', 'start', 'descending', 'state');
    messages.getMessages(opts, ctx && ctx.district, function(err, result) {
      if (err) {
        return serverError(err.message, req, res);
      }
      res.json(result);
    });
  });
});

app.get('/api/v1/messages/:id', function(req, res) {
  auth.check(req, ['can_view_data_records','can_view_unallocated_data_records'], null, function(err, ctx) {
    if (err) {
      return error(err, req, res, true);
    }
    messages.getMessage(req.params.id, ctx && ctx.district, function(err, result) {
      if (err) {
        return serverError(err.message, req, res);
      }
      res.json(result);
    });
  });
});

app.put('/api/v1/messages/state/:id', jsonParser, function(req, res) {
  auth.check(req, 'can_update_messages', null, function(err, ctx) {
    if (err) {
      return error(err, req, res, true);
    }
    messages.updateMessage(req.params.id, req.body, ctx && ctx.district, function(err, result) {
      if (err) {
        return serverError(err.message, req, res);
      }
      res.json(result);
    });
  });
});

app.post('/api/v1/records', [jsonParser, formParser], function(req, res) {
  auth.check(req, 'can_create_records', null, function(err) {
    if (err) {
      return error(err, req, res, true);
    }
    records.create(req.body, req.is(['json','urlencoded']), function(err, result) {
      if (err) {
        return serverError(err.message, req, res);
      }
      res.json(result);
    });
  });
});

app.get('/api/v1/scheduler/:name', function(req, res) {
  auth.check(req, 'can_execute_schedules', null, function(err) {
    if (err) {
      return error(err, req, res, true);
    }
    scheduler.exec(req.params.name, function(err) {
      if (err) {
        return serverError(err.message, req, res);
      }
      res.json({ schedule: req.params.name, result: 'success' });
    });
  });
});

app.get('/api/v1/forms', function(req, res) {
  forms.listForms(req.headers, function(err, body, headers) {
    if (err) {
      return serverError(err, req, res);
    }
    if (headers) {
      res.writeHead(headers.statusCode || 200, headers);
    }
    res.end(body);
  });
});

app.get('/api/v1/forms/:form', function(req, res) {
  var parts = req.params.form.split('.'),
      form = parts.slice(0, -1).join('.'),
      format = parts.slice(-1)[0];
  if (!form || !format) {
    return serverError(new Error('Invalid form parameter.'), req, res);
  }
  forms.getForm(form, format, function(err, body, headers) {
    if (err) {
      return serverError(err, req, res);
    }
    if (headers) {
      res.writeHead(headers.statusCode || 200, headers);
    }
    res.end(body);
  });
});

// DB replication endpoint
app.get('/medic/_changes', function(req, res) {
  auth.getUserCtx(req, function(err, userCtx) {
    if (err) {
      return error(err, req, res);
    }
    if (auth.hasAllPermissions(userCtx, 'can_access_directly')) {
      proxy.web(req, res);
    } else {
      auth.getFacilityId(req, userCtx, function(err, facilityId) {
        if (err) {
          return serverError(err.message, req, res);
        }
        var unassigned = config.get('district_admins_access_unallocated_messages') &&
                         auth.hasPermission(userCtx, 'can_view_unallocated_data_records');
        // for security reasons ensure the params haven't been tampered with
        if (req.query.filter === 'medic/doc_by_place') {
          // replicating docs - check facility and unassigned settings
          if (req.query.id !== facilityId ||
              (req.query.unassigned === 'true' && !unassigned)) {
            console.error('Unauthorized replication attempt - restricted filter params');
            return error({ code: 403, message: 'Forbidden' }, req, res);
          }
        } else if (req.query.filter === '_doc_ids') {
          // replicating medic-settings only
          if (req.query.doc_ids !== JSON.stringify([ '_design/medic' ])) {
            console.error('Unauthorized replication attempt - restricted filter id: ' + req.query.doc_ids[0]);
            return error({ code: 403, message: 'Forbidden' }, req, res);
          }
        } else {
          // unknown replication filter
          console.error('Unauthorized replication attempt - restricted filter: ' + req.query.filter);
          return error({ code: 403, message: 'Forbidden' }, req, res);
        }
        proxy.web(req, res);
      });
    }
  });
});

var writeHeaders = function(req, res, headers, redirect) {
  res.oldWriteHead = res.writeHead;
  res.writeHead = function(_statusCode, _headers) {
    // hardcode this so we never show the basic auth prompt
    res.setHeader('WWW-Authenticate', 'Cookie');
    if (headers) {
      headers.forEach(function(header) {
        res.setHeader(header[0], header[1]);
      });
    }
    // for dynamic resources, redirect to login page
    if (redirect && _statusCode === 401) {
      _statusCode = 302;
      res.setHeader(
        'Location',
        pathPrefix + 'login?redirect=' + encodeURIComponent(req.url)
      );
    }
    res.oldWriteHead(_statusCode, _headers);
  };
};

/**
 * Set cache control on static resources. Must be hacked in to
 * ensure we set the value first.
 */
proxy.on('proxyReq', function(proxyReq, req, res) {
  if (appcacheManifest.test(req.url)) {
    // requesting the appcache manifest
    writeHeaders(req, res, [
      [ 'Cache-Control', 'must-revalidate' ],
      [ 'Content-Type', 'text/cache-manifest; charset=utf-8' ],
      [ 'Last-Modified', 'Tue, 28 Apr 2015 02:23:40 GMT' ],
      [ 'Expires', 'Tue, 28 Apr 2015 02:21:40 GMT' ]
    ]);
  } else if (!staticResources.test(req.url) && req.url.indexOf(appPrefix) !== -1) {
    // requesting other application files
    writeHeaders(req, res, [], true);
  } else {
    // everything else
    writeHeaders(req, res);
  }
});

app.all('*', function(req, res) {
  proxy.web(req, res);
});

proxy.on('error', function(err, req, res) {
  serverError(JSON.stringify(err), req, res);
});

proxyForAuditing.on('error', function(err, req, res) {
  serverError(JSON.stringify(err), req, res);
});

var error = function(err, req, res, showPrompt) {
  if (typeof err === 'string') {
    return serverError(err, req, res);
  } else if (err.code === 500) {
    return serverError(err.message, req, res);
  } else if (err.code === 401) {
    return notLoggedIn(req, res, showPrompt);
  }
  res.writeHead(err.code || 500, {
    'Content-Type': 'text/plain'
  });
  res.end(err.message);
};

var serverError = function(err, req, res) {
  console.error('Server error: ');
  console.log('  detail: ' + (err.stack || JSON.stringify(err)));
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  });
  if (err.message) {
    res.end('Server error: ' + err.message);
  } else if (typeof err === 'string') {
    res.end('Server error: ' + err);
  } else {
    res.end('Server error');
  }
};

var notLoggedIn = function(req, res, showPrompt) {
  if (showPrompt) {
    // api access - basic auth allowed
    res.writeHead(401, {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': 'Basic realm="Medic Mobile Web Services"'
    });
    res.end('not logged in');
  } else {
    // web access - redirect to login page
    res.redirect(301, pathPrefix + 'login?redirect=' + encodeURIComponent(req.url));
  }
};

migrations.run(function(err) {
  if (err) {
    console.error(err);
  } else {
    console.log('Database migrations completed successfully');
  }
});

config.load(function(err) {
  if (err) {
    console.error('Error loading config', err);
    process.exit(1);
  }
  translations.run(function(err) {
    if (err) {
      return console.error('Error merging translations', err);
    }
    console.log('Translations merged successfully');
  });
  config.listen();
  scheduler.init();
  app.listen(5988, function() {
    console.log('Medic API listening on port 5988');
  });
});

// Define error-handling middleware last.
// http://expressjs.com/guide/error-handling.html
// jshint ignore:start
app.use(function(err, req, res, next) {
  serverError(err, req, res);
});
// jshint ignore:end
