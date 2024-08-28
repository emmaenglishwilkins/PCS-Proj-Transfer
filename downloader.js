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

function findExistingFile(downloadPath, replName) {
    const files = fs.readdirSync(downloadPath);
    const normalizedReplName = replName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    for (const file of files) {
        if (file.endsWith('.zip')) {
            const normalizedFileName = file.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedFileName.includes(normalizedReplName)) {
                return path.join(downloadPath, file);
            }
        }
    }
    return null;
}

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
        // Check if the sidebar is open
        const sidebarOpen = await driver.executeScript(() => {
            return document.querySelector('.css-7w41we') !== null;
        });
        
        // If sidebar is not open, click the button to open it
        if (!sidebarOpen) {
            console.log("sidebarOpen: ", sidebarOpen, "opening sidebar");
            const sidebarToggle = await retryingFind(driver, By.css('button[aria-label="Toggle sidebar"]'));
            await sidebarToggle.click();
            await driver.sleep(1000); // Wait for sidebar to open
        }
        const sidebarOpen2 = await driver.executeScript(() => {
            return document.querySelector('.css-7w41we') !== null;
        });
        console.log("now sidebar is: ", sidebarOpen2);

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
        const email = await askQuestion('Enter your Replit email/username: ');
        const password = await askQuestion('Enter your Replit password: ');
        const downloadDir = await askQuestion(
            `Enter the directory where projects should be downloaded (default: ./${username}): `
        ) || `./${username}`;

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

        console.log('Successfully logged in!');

        // Find and click the "See all Repls" link
        const seeAllReplsLink = await driver.wait(until.elementLocated(By.xpath("//a[contains(@href, '/repls')]")), 20000);
        await seeAllReplsLink.click();

        // Wait for the repls container to load
        await retryingFind(driver, By.css('.css-wijdl2'), 20000);

        // Add a small delay to ensure all Repls are loaded
        await driver.sleep(2000);

        let lastProcessedIndex = 0;

        while (true) {
            // Find all currently visible Repl elements
            const replElements = await driver.findElements(By.css('.css-ow5df0'));
            let allDownloaded = true; // Track if all Repls are downloaded

            // Process all visible elements
            for (let i = 0; i < replElements.length; i++) {
                // Re-fetch the replElements to avoid stale element reference
                const updatedReplElements = await driver.findElements(By.css('.css-ow5df0'));
                const replElement = updatedReplElements[i];

                // Check if the replElement is still valid
                if (!replElement) {
                    console.log(`Repl element at index ${i} is no longer valid.`);
                    continue; // Skip to the next iteration if the element is not valid
                }

                const replName = await replElement.findElement(By.css('.css-1jo2hvz')).getText();

                console.log(`Processing (${i + 1}/${updatedReplElements.length}): ${replName}`);

                const existingFile = findExistingFile(downloadPath, replName);

                if (existingFile) {
                    console.log(`Skipping download for ${replName}: File already exists (${existingFile})`);
                    continue;
                }

                try {
                    // Store the current URL to return to later
                    const replsPageUrl = await driver.getCurrentUrl();

                    // Click the project link to navigate to the Repl page
                    await replElement.findElement(By.css('a')).click();

                    // Wait for the Repl page to load
                    await driver.wait(until.urlContains('/@'), 20000);

                    // Perform the download action
                    await downloadReplFiles(driver, downloadPath, replName);

                    // Navigate back to the Repls page
                    await driver.get(replsPageUrl);

                    // Wait for the Repls page to load again
                    await retryingFind(driver, By.css('.css-wijdl2'), 20000);
                } catch (error) {
                    console.error(`Error processing Repl ${replName}:`, error.message);
                }
            }

            // If all Repls are downloaded, scroll to load more
            if (allDownloaded) {
                console.log('All visible Repls are downloaded, scrolling for more...');
                await driver.executeScript("window.scrollTo(0, document.body.scrollHeight);");
                await driver.sleep(2000); // Wait for new Repls to load
            } else {
                break; // Exit loop if not all are downloaded
            }
        }

        console.log('\nAll projects have been processed successfully!');
    } finally {
        // Quit the driver after operations
        if (driver) await driver.quit();
    }
}

main();
