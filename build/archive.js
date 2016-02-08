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

var child_process = require('child_process'),
    colors = require('colors'),
    Q = require('q'),
    semver = require('semver'),
    lint = require('./lint'),
    build = require('./build'),
    test = require('./test');

colors.mode = "console";

var allowPending = false,
    tagName = '',
    noTest = false,
    noLint = false,
    noBuild = false;

module.exports = function (options) {
    if (options.length === 1 && options[0].toLowerCase() === "help") {
        usage(true);
        return;
    }

    processOptions(options);
    verifyTagName()
        .then(checkPendingChanges)
        .then(checkoutTag)
        .then(runTests)
        .then(runLint)
        .then(runBuild)
        .then(buildPackage)
        .then(done)
        .catch(handleError);
};

var currentTask;
function handleError(error) {
    var code = 1;

    if (typeof error === "number") {
        // This should only come from test, lint or build
        code = error;
        error = 'Error: Task \'' + currentTask + '\' failed.';
    } else {
        error = '' + (error.message || error);
    }

    console.log(error.red);
    process.exit(code);
}

var warnings;
function registerWarning(msg) {
    warnings = warnings || [];
    warnings.push(msg);
}

function outputStep(msg) {
    console.log(msg.blue);
}

function runTests() {
    return runTask(test, "Test", noTest);
}

function runLint() {
    return runTask(lint, "Lint", noLint);
}

function runBuild() {
    return runTask(build, "Build", noBuild);
}

function runTask(task, taskName, skip) {
    if (skip) {
        registerWarning('Didn\'t run task \'' + taskName + '\'');
        return Q.when();
    }
    outputStep('Running task \'' + taskName + '\'...');
    currentTask = taskName;
    return task.promise();
}

function done(result) {
    if (result) {
        console.log('Package created: ' + result);
        if (warnings && warnings.length) {
            console.log(('Warning: Use this package for testing only.\n  ' + warnings.join('\n  ')).yellow);
        }
        console.log();
        process.exit(0);
    }
    process.exit(1);
}

function processOptions(options) {
    options.forEach(function (option) {
        var lowerCaseOption = option.toLowerCase();
        switch (lowerCaseOption) {
            case 'allow-pending':
                allowPending = true;
                break;

            case 'no-test':
                noTest = true;
                break;

            case 'no-lint':
                noLint = true;
                break;

            case 'no-build':
                noBuild = true;
                break;

            default:
                if (tagName) {
                    handleError("Error: Can't set tag name to '" + option + "' when it is already set to '" + tagName + "'.");
                }
                tagName = option;
        }
    });
}

function verifyTagName() {
    if (tagName) {
        return Q.when();
    }

    // Determine the most recent tag in the repository
    outputStep('Looking for most recent tag...');
    return exec('git tag --list').then(function (allTags) {
        tagName = allTags.split(/\s+/).reduce(function (currentBest, value) {
            var modifiedValue = value.replace(/^v/, '');
            if (semver.valid(modifiedValue)) {
                return !currentBest ? value : semver.gt(currentBest.replace(/^v/, ''), modifiedValue) ? currentBest : value;
            }
            if (currentBest) {
                return currentBest;
            }
            return null;
        });

        console.log('- found: ' + tagName);
    });
}

function checkoutTag() {
    if (!tagName) {
        throw "Error: Couldn't find the most recent tag name - please specify a tag or branch explicitly.";
    }

    if (tagName === 'current') {
        registerWarning('The package was built from currently checked out files, which may not correctly reflect the package version.');
        return Q.when();
    }

    outputStep('Checking out tag ' + tagName + '...');
    return exec('git symbolic-ref -q --short HEAD || git describe --tags --exact-match').then(function (currentBranch) {
        // Don't checkout the tag if its already checked out
        if (currentBranch === tagName) {
            console.log('- tag is already checked out.');
        } else {
            return exec('git checkout -q ' + tagName).then(function () {
                console.log('- success.');
            });
        }
    });
}

function checkPendingChanges() {
    outputStep('Checking for pending local changes...');
    return exec('git status --porcelain').then(function (result) {
        if (result) {
            if (allowPending) {
                registerWarning('There are pending local changes.');
            } else {
                throw 'Error: Aborting because there are pending changes.';
            }
        }
    });
}

function buildPackage() {
    outputStep('Creating package...');
    return exec('npm pack');
}

function exec(cmdLine) {
    var d = Q.defer();

    child_process.exec(cmdLine, function (err, stdout, stderr) {
        err = err || stderr;

        if (err || stderr) {
            d.reject(err || stderr);
        } else {
            d.resolve((stdout || '').trim());
        }
    });

    return d.promise;
}

function usage(includeIntro) {
    if (includeIntro) {
        console.log('');
        console.log('Creates an npm package (tgz file) for a tag or branch.');
    }

    console.log('');
    console.log('Usage:');
    console.log('');
    console.log('jake pack[allow-pending,no-test,no-lint,no-build,<tagname>]');
    console.log('');
    console.log('  allow-pending: If specified, allow uncommitted changes to exist when\n' +
        '                 packaging.');
    console.log('  no-test:       If specified, don\'t run tests before packaging.');
    console.log('  no-lint:       If specified, don\'t run lint before packaging');
    console.log('  no-build:      If specified, don\'t run build before packaging (use currently\n' +
        '                 built files).');
    console.log('  <tagname>:     If specified, an existing tag or branch to package. Otherwise\n' +
        '                 defaults to the most recent tag. Specify \'current\' to use whatever\n' +
        '                 is currently on your local machine (only use this for testing).');
}

