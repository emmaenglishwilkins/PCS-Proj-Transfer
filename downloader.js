const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configure readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Utility function to ask questions via CLI
function askQuestion(query) {
    return new Promise((resolve) => {
        rl.question(query, (ans) => {
            resolve(ans.trim());
        });
    });
}

async function humanLikeDelay(min = 500, max = 1500) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise(resolve => setTimeout(resolve, delay));
}

async function simulateHumanTyping(element, text) {
    for (const char of text) {
        await element.sendKeys(char);
        await humanLikeDelay(50, 150);
    }
}

async function retryingFind(driver, locator, timeout = 10000, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await driver.wait(until.elementLocated(locator), timeout);
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`Retrying to find element (${i + 1}/${retries})...`);
            await driver.sleep(1000);
        }
    }
}

async function downloadReplFiles(driver, downloadPath, replName) {
    try {
        // Wait for and click the "..." button to reveal more options
        const moreOptionsButton = await retryingFind(driver, By.css('button[aria-label="menu"]'));
        await moreOptionsButton.click();

        // Wait for the "Download as Zip" option to appear and click it
        const downloadZipOption = await retryingFind(driver, By.xpath("//span[text()='Download as zip']"));
        await downloadZipOption.click();

        // Wait for the download to complete (adjust time as needed)
        await driver.sleep(10000);

        console.log(`Completed download for Repl: ${replName}`);
    } catch (error) {
        console.error(`An error occurred during the download process for ${replName}:`, error.message);
    }
}

async function main() {
    let driver;

    try {
        console.log('\n=== Replit Project Downloader ===\n');

        // Collect user inputs
        const username = await askQuestion('Enter your Replit username: ');
        const email = await askQuestion('Enter your Replit email: ');
        const password = await askQuestion('Enter your Replit password: ');
        const downloadDir = await askQuestion(
            'Enter the directory where projects should be downloaded (default: ./replit_projects): '
        ) || './replit_projects';

        rl.close();

        // Ensure download directory exists
        const downloadPath = path.resolve(downloadDir);
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
            console.log(`Created download directory at: ${downloadPath}`);
        }

        // Set up Chrome options
        const chromeOptions = new chrome.Options();
        chromeOptions.addArguments('--disable-extensions');
        chromeOptions.setUserPreferences({
            'download.default_directory': downloadPath,
            'download.prompt_for_download': false,
            'download.directory_upgrade': true,
            'safebrowsing.enabled': false
        });

        // Initialize Selenium WebDriver with Chrome options
        driver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();

        // Load Replit login page
        await driver.get(`https://replit.com/login`);
        await humanLikeDelay();

        // Wait until login form is loaded
        await driver.wait(until.elementLocated(By.css('input[name="username"]')), 10000);

        // Enter email with human-like typing
        const emailField = await driver.findElement(By.css('input[name="username"]'));
        await simulateHumanTyping(emailField, email);
        await humanLikeDelay();

        // Enter password with human-like typing
        const passwordField = await driver.findElement(By.css('input[name="password"]'));
        await simulateHumanTyping(passwordField, password);
        await humanLikeDelay();

        // Move mouse to login button and click
        const loginButton = await driver.findElement(By.css('button[type="submit"]'));
        const actions = driver.actions({async: true});
        await actions.move({origin: loginButton}).pause(500).click().perform();

        //  Wait for login to complete and dashboard to load
        // await driver.wait(until.elementLocated(By.css('.dashboard-header')), 20000);

        console.log('Successfully logged in!');
        // Use browser navigation to go to the user's dashboard
        // await driver.get('https://replit.com/~');

        // Find and click the "See all Repls" link
        const seeAllReplsLink = await driver.wait(until.elementLocated(By.xpath("//a[contains(@href, '/repls')]")), 20000);
        await seeAllReplsLink.click();

        // Wait for the repls container to load
        await retryingFind(driver, By.css('.css-wijdl2'), 20000);

        // Add a small delay to ensure all Repls are loaded
        await driver.sleep(2000);

        // Retrieve all Repl elements
        let replElements = await driver.findElements(By.css('.css-ow5df0'));

        console.log(`\nFound ${replElements.length} Repl projects. Starting download...\n`);

        for (let index = 0; index < replElements.length; index++) {
            let retries = 3;
            
            while (retries > 0) {
                try {
                    // Re-fetch the current Repl element
                    replElements = await driver.findElements(By.css('.css-ow5df0'));
                    const replElement = replElements[index];

                    // Find the link within the Repl element
                    const replLink = await replElement.findElement(By.css('a'));
                    
                    // Get the Repl name
                    const replName = await replElement.findElement(By.css('.css-1jo2hvz')).getText();

                    console.log(`Processing (${index + 1}/${replElements.length}): ${replName}`);

                    // Store the current URL to return to later
                    const replsPageUrl = await driver.getCurrentUrl();

                    // Click the project link to navigate to the Repl page
                    await replLink.click();

                    // Wait for the Repl page to load
                    await driver.wait(until.urlContains('/@'), 10000);

                    // Perform the download action
                    await downloadReplFiles(driver, downloadPath, replName);

                    // Navigate back to the Repls page
                    await driver.get(replsPageUrl);

                    // Wait for the Repls page to load again
                    await retryingFind(driver, By.css('.css-wijdl2'), 20000);

                    break;  // If successful, break out of the retry loop
                } catch (error) {
                    console.error(`Error processing Repl (attempt ${4 - retries}/3):`, error.message);
                    retries--;
                    if (retries === 0) {
                        console.error(`Failed to process Repl after 3 attempts. Moving to next Repl.`);
                    } else {
                        console.log(`Retrying...`);
                        // Navigate back to the Repls page
                        await driver.get('https://replit.com/repls');
                        await retryingFind(driver, By.css('.css-wijdl2'), 20000);
                    }
                }
            }
        }

        console.log('\nAll projects have been processed successfully!');
    } finally {
        // Quit the driver after operations
        if (driver) await driver.quit();
    }
}

main();
