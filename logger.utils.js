const winston = require("winston");

const logger = new winston.Logger({
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  },
  colors: {
    trace: 'gray'
  },
  transports: [],
  exitOnError: false
});

console.log('Use console logger');
logger.add(winston.transports.Console, {
  handleExceptions: true,
  humanReadableUnhandledException: true,
  level: 'trace',
  timestamp: () => new Date().toISOString(),
  colorize: true,
  json: false,
  stringify: obj => JSON.stringify(obj)
}
);


logger.stream = {
  write: function(message, encoding){
    logger.info(message);
  }
};


logger.errorToString = function (err) {
  if (err instanceof Error) {
    return JSON.stringify(err, ["message", "arguments", "type", "name", "stack"]);
  } else {
    return JSON.stringify(err);
  }
};

logger.debug('Debug mode is activated');

module.exports = logger;