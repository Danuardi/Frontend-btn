const EventEmitter = require('events');
const logger = require('./logger');

class DataUpdateEmitter extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(20); // Increase max listeners to handle multiple subscribers
    }

    emit(event, ...args) {
        logger.log('event-emitter', `Emitting event: ${event}`, 'debug');
        return super.emit(event, ...args);
    }
}

// Create a singleton instance
const dataUpdateEmitter = new DataUpdateEmitter();

// Add error handling
dataUpdateEmitter.on('error', (error) => {
    logger.log('event-emitter', `Error in event emitter: ${error.message}`, 'error');
});

module.exports = dataUpdateEmitter;
