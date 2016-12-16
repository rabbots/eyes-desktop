import notify from '../notify'
import {W3afWrapper} from '../scanners/w3af'

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
        console.log(JSON.stringify(result))
        notify({
          title: 'Scan completed',
          body: `Your website has been scanned. ${url}`
        })
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
  }
}
export {webScanner, dockerScanner}
