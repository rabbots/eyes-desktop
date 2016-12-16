import {Promise} from 'es6-promise'
import {spawn} from 'child_process'
import mkdirp from 'mkdirp'
import fs from 'fs-promise'
import x2js from 'xml2json'
import {resolve as resolvePath} from 'app-root-path'

function mkdirpAsync(path, mode) {
  return new Promise((resolve, reject) => {
    mkdirp(path, mode, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve()
      }
    })
  });
}

var deleteFolderRecursive = function (path) {
  if( fs.existsSync(path) ) {
    fs.readdirSync(path).forEach(function(file,index){
      var curPath = path + "/" + file;
      if(fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

function makeid(len)
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < (len || 5); i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

class W3afWrapper {

  init(name) {
    this._name = name || makeid(5);
    this._containerShare = '/share'
    this._hostTmpPath = `/Users/niponc/.rabbots/w3af/${this._name}`
    this._tmpSharePath = `${this._hostTmpPath}/script.w3af`
    this._scriptFileName = `${this._containerShare}/script.w3af`
    this._hostOutputFileName = `${this._hostTmpPath}/output-w3af.xml`
  }

  start(url){
    var processPromise = new Promise((accept, reject) => {
      this._processComplete = accept
      this._processFail = reject
    })

    this._startTime = new Date()
    // Make directory
    // TODO: do we really need 777 permission?
    process.umask(0);
    return mkdirpAsync(this._hostTmpPath, '777')
      .then(() => {
        console.log('Loading script template script')
        return fs.readFile(resolvePath('./scanners/script.w3af'), {encoding:'utf8'})
      }).then((contents) => {
        console.log('Processing script')
        return contents.replace('<%target%>', url)
      }).then((script) => {
        console.log(`Saving script to ${this._tmpSharePath}`)
        fs.writeFileSync(`${this._hostOutputFileName}`, '', { mode: '777' })
        return fs.writeFile(`${this._tmpSharePath}`, script, { mode: '777' })
      })
      .then(() => {
        // start docker
        console.log('start docker: ' + `${this._hostTmpPath}:${this._containerShare}`)
        this._dockerCmd = spawn(
          'docker',
          ['run',  '-v', `${this._hostTmpPath}:${this._containerShare}`, 'rabbots/w3af', '-s', this._scriptFileName]);

        this._dockerCmd.stdout.on('data', this._onStdOut.bind(this));
        this._dockerCmd.stderr.on('data', this._onStdErr.bind(this));
        this._dockerCmd.on('close', this._onClose.bind(this));
      })
      .then(() => {
        return processPromise
      })
      .catch((err) => {
        console.log(err)
        throw err
      })
  }

  _onStdOut(data) {
    console.log(`stdout: ${data}`);
  }

  _onStdErr(data) {
    console.log(`stderr: ${data}`);
  }

  _onClose(code) {
    // normal exit code 0
    this._onProcessComplete();
    console.log(`child process exited with code ${code}`);
  }

  _onProcessComplete() {
    fs.readFile(this._hostOutputFileName, {encoding:'utf8'}).then(
      (contents) => {
        return x2js.toJson(contents)
      }).then((jsonReport) => {
        this._processComplete && this._processComplete(jsonReport)
      }
    ).catch((err) => {
      this._processFail && this._processFail(err);
    });
  }

  _onProcessFail() {
    this._processFail && this._processFail()
  }

  cleanUp() {
    console.log(`Clean up path: ${this._hostTmpPath}`)
    // deleteFolderRecursive(this._hostTmpPath)
  }

  // TODO: able to query status: i.e. elapse time, state
}

export {W3afWrapper}
