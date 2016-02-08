/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */
var colors = require('colors'),
    jWorkflow = require('jWorkflow'),
    Q = require('q'),
    quotes = require('./quotes'),
    pack = require('./pack-files'),
    clean = require('./clean'),
    compress = require('./compress'),
    hosted = require('./targets/hosted');

colors.mode = "console";

function _done(error, done) {
    if (typeof error === "function") {
        done = error;
        error = null;
    }

    if (error) {
        console.log("Build failed: ".red + error.toString().red);
        (done || process.exit)(1);
    } else {
        console.log("Build succeeded.".green);
        quotes.random();
        (done || process.exit)();
    }
}

function _handle(func) {
    return function (ext, opts, done) {
        try {
            func.apply(func, Array.prototype.slice.call(arguments));
        } catch (e) {
            _done(e.message + "\n" + e.stack, done);
        }
    };
}

var build = module.exports = _handle(function (ext, opts, done) {
    opts = opts || {};

    var build = jWorkflow.order(clean)
                         .andThen(pack)
                         .andThen(hosted);

    if (opts.compress) {
        build.andThen(compress);
    }

    build.start(function () {
        _done(done);
    });
});

module.exports.promise = function (ext, opts) {
    var d = Q.defer();
    build(ext, opts, function (code) {
        if (code) {
            d.reject(code);
        } else {
            d.resolve();
        }
    });
    return d.promise;
};
