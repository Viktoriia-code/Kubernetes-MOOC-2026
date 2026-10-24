const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const storedString = uuidv4();
const statusFile = process.env.STATUS_FILE || '/usr/src/app/files/status.txt';

function writeStatus() {
  const status = `${new Date().toISOString()}: ${storedString}\n`;

  fs.appendFile(statusFile, status, (error) => {
    if (error) {
      console.error(`Failed to write status file: ${error.message}`);
      return;
    }

    console.log(status.trim());
  });
}

writeStatus();
setInterval(writeStatus, 5000);
