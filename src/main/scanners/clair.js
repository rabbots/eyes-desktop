var path = require('path')
var Dockerode = require('dockerode')
var fs = require('fs-promise')
var spawn = require('child_process').spawn
var spawnSync = require('child_process').spawnSync
var resolvePath = require('app-root-path').resolve
var exec = require('child_process').exec
var mv = require('mv')

// build image
// start clair
// push local image
// analyse and gen report
// save report to output folder
// remove image file

//./hyperclair report rabbots/w3af --local --config ./hyperclair.yml --log-level Debug
//./hyperclair analyse rabbots/w3af --local --config ./hyperclair.yml --log-level Debug
//./hyperclair push rabbots/w3af --local --config ./hyperclair.yml --log-level Debug

var scannersDir = resolvePath('./scanners/')
var clairDCFile = 'clair-docker-compose.yml'
console.log(`currentPath: ${scannersDir}`)

function makeid(len)
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < (len || 5); i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

function startClair() {
  console.log('Starting Clair')
  var processComplete, processFail, hasError

  var processPromise = new Promise((accept, reject) => {
      processComplete = accept
      processFail = reject
    })

  var process

  exec('docker-compose -f clair-docker-compose.yml up -d postgres; sleep 5; docker-compose -f clair-docker-compose.yml up -d clair', {
      cwd: scannersDir
    }, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      processFail(error)
      return;
    }

    printStdOut(stdout)
    printStdErr(stderr)
    processComplete(true)
    console.log('Clair started')
  })

  return processPromise
}

function buildConatiner(imagePath, sessionId) {
  var sid = sessionId || makeid(5).toLowerCase()
  var imageDir = path.dirname(imagePath)
  var imageFilename = path.basename(imagePath)
  var imageTag = `rabbotsscan/${sid}`
  var containerId;
  console.log(`Building container: ${imagePath} as ${imageTag}`)
  return new Promise((accept, reject) => {
    var dockerProcess = spawn('docker', ['build', '-f', imageFilename, '-t', imageTag, '.'], {cwd: imageDir})

    dockerProcess.stdout.on('data', (data) => {
      var d = `${data}`
      var matchedResult = d.match('Successfully built ([a-z 0-9]+)')
      printStdOut(data)
      if (matchedResult !== null) {
        containerId = matchedResult[1]
        accept(imageTag)
      }
    });
    dockerProcess.stderr.on('data', (data) => printStdErr(data));
    dockerProcess.on('close', (code) => {
      printExitCode(code)

      if (!containerId) {
        reject(new Error(`Build image error: ${code}`))
      }

    });
    dockerProcess.on('error', (error) => {
      reject(error)
    })
  })
}

function deleteContainer(containerTag) {
  console.log(`Deleting container: ${containerTag}`)
  return new Promise((accept, reject) => {
    var dockerProcess = spawn('docker', ['rmi', '-f', containerTag])
    dockerProcess.stdout.on('data', (data) => printStdOut(data));
    dockerProcess.stderr.on('data', (data) => printStdErr(data));
    dockerProcess.on('close', (code) => {
      printExitCode(code)
      accept(true)
    });
    dockerProcess.on('error', (error) => {
      reject(error)
    })
  })
}

function copyReport(sessionId) {
  var sid = sessionId || makeid(5)
  var reportPath = path.join(scannersDir, 'reports', 'html')
  var targetPath = path.join(process.env['HOME'], '.rabbots', 'result', 'Clair', sid)
  console.log(`Copy Report to ${targetPath}`)

  return new Promise((accept, reject) => {
    mv(reportPath, targetPath, {mkdirp: true}, (err) => {
      if (err) {
        console.error(err)
        reject(err)
      } else {
        accept(true)
      }
    })
  })
}

class ClairScanner {
  constructor(id) {
    this._id = id || makeid(5).toLowerCase()
  }
  scan(dockerFilePath) {
    this.log(`prepareing scanner for ${dockerFilePath}`)
    var dockerImageName = ''
    var hc = new HyperClair()
    return hc.health().then((result) => {
      if (result) {
        return Promise.resolve(true)
      } else {
        return startClair()
      }
    }).then((result) => {
      if (result) {
        return buildConatiner(dockerFilePath, this._id).then((tag) => {dockerImageName = tag; return true})
      }
    }).then((result) => {
      if (result) {
        return hc.push(dockerImageName)
      }
    }).then((result) => {
      if (result) {
        return hc.analyse(dockerImageName)
      }
    }).then((result) => {
      if (result) {
        return hc.report(dockerImageName)
      }
    }).then(() => {
      var tag = dockerImageName
      dockerImageName = ''
      if (tag) {
        deleteContainer(tag)
      }
      return copyReport(this._id)
    }).catch((error) => {
      this.log('error: '+ error)
      if (dockerImageName){
        deleteContainer(dockerImageName)
      }
      return false
    })

  }

  log(msg) {
    console.log(`${this._id}: ${msg}`)
  }
}

class HyperClair {
  constructor() {
    this._hyperClairDir = scannersDir;
    this._hyperClair = path.join(scannersDir, 'hyperclair')
    this._hyperClairConfig = path.join(scannersDir, 'hyperclair.yml')
  }

  health() {
    console.log(`HyperClair: Checking Clair service`)
    return new Promise((accept, reject) => {
      var hcProcess = spawn(this._hyperClair, ['health', '--config', this._hyperClairConfig], {cwd: this._hyperClairDir})
      hcProcess.stdout.on('data', (data) => {
        printStdOut(data)
        var d = `${data}`
        if (d.indexOf('✔') >= 0) {
          console.log(`HyperClair: Clair is running`)
          accept(true)
        } else if (d.indexOf('✘') >= 0) {
          console.log(`HyperClair: Clair is not running`)
          accept(false)
        }
      });
      hcProcess.stderr.on('data', (data) => printStdErr(data));
      hcProcess.on('close', (code) => {
        printExitCode(code)
        accept(false)
      });
      hcProcess.on('error', (error) => {
        reject(error)
      })
    })
  }

  push(imageName) {
    console.log(`HyperClair: pushing image ${imageName}`)
    return new Promise((accept, reject) => {
      var hcProcess = spawn(this._hyperClair, ['push', imageName, '--local', '--config', this._hyperClairConfig, '--log-level', 'Debug'], {cwd: this._hyperClairDir})
      hcProcess.stdout.on('data', (data) => printStdOut(data));
      hcProcess.stderr.on('data', (data) => printStdErr(data));
      hcProcess.on('close', (code) => {
        printExitCode(code)
        accept(code === 0)
      });
      hcProcess.on('error', (error) => {
        reject(error)
      })
    })
  }

  analyse(imageName) {
    console.log(`HyperClair: analysing image ${imageName}`)
    return new Promise((accept, reject) => {
      var hcProcess = spawn(this._hyperClair, ['analyse', imageName, '--local', '--config', this._hyperClairConfig, '--log-level', 'Debug'], {cwd: this._hyperClairDir})
      hcProcess.stdout.on('data', (data) => printStdOut(data));
      hcProcess.stderr.on('data', (data) => printStdErr(data));
      hcProcess.on('close', (code) => {
        printExitCode(code)
        accept(code === 0)
      });
      hcProcess.on('error', (error) => {
        reject(error)
      })
    })
  }

  report(imageName) {
    console.log(`HyperClair: generate report for image ${imageName}`)
    return new Promise((accept, reject) => {
      var hcProcess = spawn(this._hyperClair, ['report', imageName, '--local', '--config', this._hyperClairConfig, '--log-level', 'Debug'], {cwd: this._hyperClairDir})
      hcProcess.stdout.on('data', (data) => printStdOut(data));
      hcProcess.stderr.on('data', (data) => printStdErr(data));
      hcProcess.on('close', (code) => {
        printExitCode(code)
        accept(code === 0)
      });
      hcProcess.on('error', (error) => {
        reject(error)
      })
    })
  }
}

function printStdOut(data) {
  if (!omitStd) {
    console.log(`${data}`)
  }
}

function printStdErr(data) {
  if (!omitStd) {
    console.error(`${data}`)
  }
}

function printExitCode(code) {
  console.log(`close: ${code}`)
}

var omitStd = false
module.exports.ClairScanner = ClairScanner

