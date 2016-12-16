import {Promise} from 'es6-promise'
import {spawn} from 'child_process'

class DockerBenchWrapper {
  constructor() {
    this._scanResult = []
  }

  scan() {
    var processPromise = new Promise((accept, reject) => {
      this._processComplete = accept
      this._processFail = reject
    })

    this._dockerCmd = spawn(
        'docker',
        ['run',
        '--net', 'host', '--pid', 'host', '--cap-add', 'audit_control',
        '-v', `/var/lib:/var/lib`,
        '-v', `/var/run/docker.sock:/var/run/docker.sock`,
        '-v', `/usr/lib/systemd:/usr/lib/systemd`,
        '-v', `/etc:/etc`,
        'docker/docker-bench-security']);

    this._dockerCmd.stdout.on('data', this._onStdOut.bind(this));
    this._dockerCmd.stderr.on('data', this._onStdErr.bind(this));
    this._dockerCmd.on('close', this._onClose.bind(this));

      return processPromise
  }

  _onStdOut(data) {
    var text = `${data}`.replace(/(\x1b\[[0-9].?m)|(\u001b\[[0-9;]+m)/g, '')
    this._scanResult.push(text)
    console.log(`stdout: ${text}`);
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
    this._processComplete && this._processComplete(this._scanResult)
  }

  _onProcessFail() {
    this._processFail && this._processFail()
  }

  cleanUp() {
  }
}

export {DockerBenchWrapper}

/*
docker run -it --net host --pid host --cap-add audit_control \
    -v /var/lib:/var/lib \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /usr/lib/systemd:/usr/lib/systemd \
    -v /etc:/etc --label docker_bench_security \
    docker/docker-bench-security
 */
