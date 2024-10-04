/*
 * Copyright (c) [2024] [Giorgio Daniele Luppina]. All rights reserved.
 *
 * This code is provided "as is" and can be used, modified, and redistributed with or without
 * modification. No warranty is provided, and the author is not responsible for any issues
 * arising from its use. 
 *
 * For more information, contact [giorgiodaniele15@gmail.com].
 */


const puppeteer = require('puppeteer'); // load puppeteer module
const path = require('path'); // load file system utilities
const fs = require('fs');
const puppeteerHar = require('puppeteer-har'); // load HAR utilities
const config = require('./config.json'); // load configuration file
const { spawn } = require("child_process"); // load process utilities

// Utility class for handling common operations
class Utils {
    static currentTime() {
        return new Date().toDateString(); // returns current time as string
    }

    static currentUnix() {
        return Date.now(); // returns current timestamp in Unix epoch milliseconds
    }

    static awaiting(ms) {
        return new Promise(resolve => setTimeout(resolve, ms)); // utility for async waiting
    }

    static makeOutputDir() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS format
        const dirPath = path.join(__dirname, `${dateStr}_${timeStr}`);

        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath); // create directory if it doesn't exist
        }

        return dirPath;
    }

    static cleanFiles(...files) {
        files.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file); // remove file if it exists
            }
        });
    }

    static checkCookies() {
        const userDataDir = path.join(__dirname, 'user_data');
        if (!fs.existsSync(userDataDir)) {
            const currentTime = Utils.currentTime(); // Precompute timestamp
            console.log(`[${currentTime}] The 'user_data' directory does not exist.`);
            console.log(`[${currentTime}] Please run 'node register.js' to set up the user data.`);
            process.exit(1);
        }
    }
}

// Class to handle tshark sniffer process
class Sniffer {
    constructor(outputPath) {
        this.outputPath = outputPath;
        this.snifferProcess = null;
    }

    start() {
        const { bin, net, max } = config.sniffer;
        const cmd = [bin, '-i', net, '-s', max, '-w', this.outputPath];
        this.snifferProcess = spawn(cmd[0], cmd.slice(1));

        const currentTime = Utils.currentTime(); // Precompute timestamp
        this.snifferProcess.on("error", (error) => {
            console.error(`[${currentTime}] Error starting tshark process: ${error.message}`);
        });

        this.snifferProcess.on("exit", (code) => {
            const exitTime = Utils.currentTime(); // Compute timestamp on exit
            if (code === 0) {
                console.log(`[${exitTime}] Tshark process exited successfully.`);
            } else {
                console.error(`[${exitTime}] Tshark process exited with error code: ${code}`);
            }
        });
    }

    stop(signal = "SIGTERM") {
        if (this.snifferProcess && !this.snifferProcess.killed) {
            const currentTime = Utils.currentTime(); // Precompute timestamp
            console.log(`[${currentTime}] Stopping tshark process with PID: ${this.snifferProcess.pid}`);
            this.snifferProcess.kill(signal);

            this.snifferProcess.on("exit", (code, signal) => {
                const exitTime = Utils.currentTime(); // Precompute timestamp for exit
                if (signal) {
                    console.log(`[${exitTime}] Tshark process was stopped by signal: ${signal}`);
                } else if (code !== 0) {
                    console.error(`[${exitTime}] Tshark process terminated with error code: ${code}`);
                } else {
                    console.log(`[${exitTime}] Tshark process stopped successfully.`);
                }
            });
        }
    }
}

// Class to handle browser operations
class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async launch() {
        this.browser = await puppeteer.launch({ 
            headless: false, 
            userDataDir: "./user_data", 
            defaultViewport: null 
        });

        const pages = await this.browser.pages();
        this.page = pages.length > 0 ? pages[0] : null;

        if (!this.page) {
            await this.browser.close();
            throw new Error('No page available in the browser');
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close(); // close browser
        }
    }

    async startHarLogging(outputPath) {
        const har = new puppeteerHar(this.page);
        await har.start({ path: outputPath }); // start capturing HTTP requests/responses
        return har;
    }
}

// class to manage experiment logic
class Experiment {
    constructor() {
        this.outputDir = Utils.makeOutputDir();
        this.fastAwait  = config.fastAwait * 1000;
        this.longAwait  = config.longAwait * 1000;
        this.watchAwait = config.longAwait * 1000 * 30;
    }

    async run() {
        const repetitions = config.repetitions;
        const channels = config.channels;

        for (let number = 0; number < repetitions; number++) {
            const currentTime = Utils.currentTime(); // Precompute timestamp
            console.log(`[${currentTime}] Running experiment ${number + 1}`);

            let logNetFile, logBotFile, logHarFile, sniffer, browserManager;
            try {
                logNetFile = path.join(this.outputDir, `log_net_complete-${number + 1}.pcap`);
                logBotFile = path.join(this.outputDir, `log_bot_complete-${number + 1}.csv`);
                logHarFile = path.join(this.outputDir, `log_har_complete-${number + 1}.har`);

                fs.appendFileSync(logBotFile, `event abs rel\n`);
                const originTime = Utils.currentUnix();
                fs.appendFileSync(logBotFile, `origin ${originTime} ${0}\n`);

                // start sniffer
                sniffer = new Sniffer(logNetFile);
                sniffer.start();
                const snifferStartTime = Utils.currentUnix(); // Precompute timestamp
                fs.appendFileSync(logBotFile, `sniffer-on ${snifferStartTime} ${snifferStartTime - originTime}\n`);

                // start browser
                browserManager = new BrowserManager();
                await browserManager.launch();
                const browserStartTime = Utils.currentUnix(); // Precompute timestamp
                fs.appendFileSync(logBotFile, `browser-on ${browserStartTime} ${browserStartTime - originTime}\n`);

                await Utils.awaiting(this.fastAwait);

                const harLogger = await browserManager.startHarLogging(logHarFile);
                await browserManager.page.goto(config.homepage);
                await Utils.awaiting(this.longAwait);

                for (const channel of channels) {
                    await browserManager.page.goto(channel.link);

                    const channelStartTime = Utils.currentUnix(); // Precompute timestamp
                    fs.appendFileSync(logBotFile, `${channel.name}-on ${channelStartTime} ${channelStartTime - originTime}\n`);

                    // watch the stream
                    await Utils.awaiting(this.watchAwait); // watch the stream

                    const channelStopTime = Utils.currentUnix(); // Precompute timestamp
                    fs.appendFileSync(logBotFile, `${channel.name}-off ${channelStopTime} ${channelStopTime - originTime}\n`);

                    await browserManager.page.goto(config.homepage);
                    await Utils.awaiting(this.fastAwait);
                }

                await harLogger.stop();
                await browserManager.close();
                const browserStopTime = Utils.currentUnix(); // Precompute timestamp
                fs.appendFileSync(logBotFile, `browser-off ${browserStopTime} ${browserStopTime - originTime}\n`);

                await Utils.awaiting(this.longAwait * 2);
                sniffer.stop();
                const snifferStopTime = Utils.currentUnix(); // Precompute timestamp
                fs.appendFileSync(logBotFile, `sniffer-off ${snifferStopTime} ${snifferStopTime - originTime}\n`);
            } catch (error) {
                console.error(`Error during experiment ${number + 1}:`, error.message);
                if (browserManager) await browserManager.close();
                Utils.cleanFiles(logNetFile, logBotFile, logHarFile);
                if (sniffer) sniffer.stop();
            }
        }
    }
}

// main execution
(async () => {
    Utils.checkCookies();
    const experiment = new Experiment();
    await experiment.run();
})();
