import notify from '../notify'
import {W3afWrapper} from '../scanners/w3af'
import {DockerBenchWrapper} from '../scanners/docker-bench'
import {ClairScanner} from '../scanners/clair'
import mkdirp from 'mkdirp'
import fs from 'fs-promise'
import path from 'path'

const resultPath = path.join(process.env['HOME'], '.rabbots', 'result')

function saveResult(fileName, result){
  return mkdirpAsync(resultPath)
    .then(() => {
      return fs.writeFile(path.join(resultPath, fileName), JSON.stringify(result, null, '\t'))
    })
}

function mkdirpAsync(p) {
  return new Promise((resolve, reject) => {
    mkdirp(p, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve()
      }
    })
  });
}

var webScanner = {
  scan(url) {
    notify({
          title: 'Scanning item...',
          body: `Your website is being scanned. ${url}`
        })
    var w3afWrapper = new W3afWrapper()
    w3afWrapper.init()
    return w3afWrapper.start(url)
      .then((result) => {
        console.log('## DONE ##')
        console.log(result)
        notify({
          title: 'Scan completed',
          body: `Your website has been scanned. ${url}`
        })
        return saveResult('w3af.json', result)
      }).then(() => {
        w3afWrapper.cleanUp()
      })
      .catch((error) => {
        w3afWrapper.cleanUp()
        throw error
      })
  }
}

var dockerScanner = {
  scan(dockerFile) {
    notify({
    title: 'Scanning item...',
    body: `Your docker file is being scanned. ${dockerFile}`
    })

    var cs = new ClairScanner()
    return cs.scan(dockerFile).then((result) => {
      console.log(result)

      notify({
          title: `Scan ${result?'completed':'failed'}`,
          body: `Your docker file has ${result?'':'not'} been scanned. ${dockerFile}`
        })
    }).catch((err) => {
      console.error(err)
    });
  }
}
export {webScanner, dockerScanner}
