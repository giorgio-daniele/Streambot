/*
 * Copyright (c) [2024] [Giorgio Daniele Luppina]. All rights reserved.
 *
 * This code is provided "as is" and can be used, modified, and redistributed with or without
 * modification. No warranty is provided, and the author is not responsible for any issues
 * arising from its use. 
 *
 * For more information, contact [giorgiodaniele15@gmail.com].
 */


const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Load configuration from config.json
const config = require('./config.json');

// Extract settings from config
const { url, username, password } = config.login;
const userDataDir = path.join(__dirname, 'user_data');

// Function to check if the user data directory exists
const doesUserDataDirExist = (dir) => {
    return fs.existsSync(dir);
}

// Function to delay
const wait = (s) => {
    return new Promise(resolve => setTimeout(resolve, s * 1000));
}

const registerUser = async () => {
    // Generate a new browser process
    const browser = await puppeteer.launch({ 
        headless: false, 
        userDataDir: userDataDir
    });

    // Get a tab (an existing one)
    const [page] = await browser.pages();

    await page.goto(url);

    // Search for accepting the cookies
    const banner = await page.waitForSelector("#onetrust-accept-btn-handler"); 
    await wait(5);   
    await banner.click();

    // Wait before next step
    await wait(5);

    // Search for the email
    await page.waitForSelector('#email');
    await page.type('#email', username);    

    // Wait before next step
    await wait(5);
    
    // Search for the password
    await page.waitForSelector('#password');
    await page.type('#password', password);

    // Wait before next step
    await wait(5);
    
    await page.waitForSelector('button[type=submit]');
    await page.click('button[type=submit]');

    // Wait before closing the app
    await wait(10);

    await browser.close();
}

const main = async () => {
    if (doesUserDataDirExist(userDataDir)) {
        console.log("Already logged in");
        console.log("Remove user_data to generate a new profile");
    } else {
        await registerUser();
        console.log("You logged in!");
    }
}

main();
