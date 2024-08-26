// TODO: download known repls 

const { Builder, By, Key, until } = require('selenium-webdriver');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

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

// Main function to execute the script
(async function main() {
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

        // Initialize Selenium WebDriver
        const driver = await new Builder().forBrowser('chrome').build(); // this is for chrome aka my mac
        // const driver = await new Builder().forBrowser('edge').build(); // this is for microsoft edge aka my lenovo

        try {
            // Login to Replit
            await loginToReplit(driver, email, password);

            // Retrieve all Repl project names and URLs
            const replProjects = await getAllReplProjects(driver, username);

            if (replProjects.length === 0) {
                console.log('No Repl projects found for this user.');
                return;
            }

            // removes underscores from replit names so that the corresponding web link is correct
            for (const [index, repl] of replProjects.entries()) {
                console.log(`(${index + 1}) ${repl.name}`);
                if (repl.name.includes("_")) { 
                    repl.name = repl.name.replace(/_/g, "");
                    console.log(repl.name); // Print the updated name
                }
            }

            console.log(`\nFound ${replProjects.length} Repl projects. Starting download...\n`);

            for (const [index, repl] of replProjects.entries()) { 
                console.log(`Downloading (${index + 1}/${replProjects.length}): ${repl.name}`);
                // Construct the URL using a template literal
                const replUrl = `https://replit.com/@${username}/${repl.name}`;
                // Call the download function
                await downloadReplFiles(driver, replUrl, downloadPath, ['main.py']);
            }
            
            // // Download each Repl project as a zip file
            // for (const [index, repl] of replProjects.entries()) {
            //     console.log(`Downloading (${index + 1}/${replProjects.length}): ${repl.name}`);
            //     await downloadRepl(driver, repl.url, downloadPath);
            // }

            console.log('\nAll projects have been downloaded successfully!');
        } finally {
            // Quit the driver after operations
            await driver.quit();
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();

/**
 * Logs into Replit with provided credentials.
 * @param {WebDriver} driver
 * @param {string} email
 * @param {string} password
 */
async function loginToReplit(driver, email, password) {
    console.log('\nLogging into Replit...');

    await driver.get('https://replit.com/login');

    // Wait until login form is loaded
    await driver.wait(until.elementLocated(By.css('input[name="username"]')), 10000);

    // Enter email
    const emailField = await driver.findElement(By.css('input[name="username"]'));
    await emailField.sendKeys(email);

    // Enter password
    const passwordField = await driver.findElement(By.css('input[name="password"]'));
    await passwordField.sendKeys(password);

    // Click login button
    const loginButton = await driver.findElement(By.css('button[type="submit"]'));
    await loginButton.click();

    console.log('Successfully logged in!');
}

// WORKING!!!! - this will need to be modified to choose the viewmore selector to get all repl projects

/**
 * Retrieves all Repl projects for the specified user.
 * @param {WebDriver} driver
 * @param {string} username
 * @returns {Promise<Array<{name: string, url: string}>>}
 */
async function getAllReplProjects(driver, username) {
    console.log(`\nRetrieving Repl projects for user: ${username}`);

    // Navigate to user's profile page
    await driver.get(`https://replit.com/@${username}`);

    // Wait until Repls are loaded
    await driver.wait(until.elementLocated(By.css('.css-6og7tn li')), 10000);

    const repls = new Set();
    let lastHeight = await driver.executeScript('return document.body.scrollHeight');

    while (true) {
        // Get all Repl elements currently loaded
        const replElements = await driver.findElements(By.css('.css-6og7tn li'));

        for (const replElement of replElements) {
            const nameElement = await replElement.findElement(By.css('.css-1t25kw8'));
            const name = await nameElement.getText();

            const linkElement = await replElement.findElement(By.css('a'));
            const url = await linkElement.getAttribute('href');

            repls.add(JSON.stringify({ name, url }));
        }

        // Scroll to bottom to load more Repls
        await driver.executeScript('window.scrollTo(0, document.body.scrollHeight);');
        await driver.sleep(2000); // Wait for new Repls to load

        const newHeight = await driver.executeScript('return document.body.scrollHeight');
        if (newHeight === lastHeight) {
            // No more new Repls loaded
            break;
        }
        lastHeight = newHeight;
    }

    const replList = Array.from(repls).map((repl) => JSON.parse(repl));

    console.log(`Found ${replList.length} Repl projects.`);

    return replList;
}


// const { By, until } = require('selenium-webdriver');
// const path = require('path');

/**
 * Downloads specified files from a Repl project as a zip file.
 * @param {WebDriver} driver
 * @param {string} replUrl
 * @param {string} downloadPath
 * @param {Array<string>} filenames
 */
async function downloadReplFiles(driver, replUrl, downloadPath, filenames) {
    // Navigate to the Repl's page
    await driver.get(replUrl);

    // Wait for the page to load fully
    await driver.wait(until.elementLocated(By.css('body')), 30000);

    // Wait for and click the "..." button to reveal more options
    try {
        // Locate the "..." button using the class name
        const moreOptionsButton = await driver.findElement(By.css('button.css-1drvipl'));
        await moreOptionsButton.click();
    } catch (error) {
        console.error('Could not find the "More options" button:', error.message);
        return;
    }

    // Wait for the "Edit in Workspace" option to appear and click it
    const editButton = await driver.wait(until.elementLocated(By.xpath("//span[text()='Edit in Workspace']")), 10000);
    await editButton.click();

    // Wait for the workspace to load fully
    await driver.wait(until.elementLocated(By.css('body')), 30000);

    // Click on the "..." button in the workspace
    try {
        // Locate the "..." button in the workspace using the same method
        const workspaceMoreOptionsButton = await driver.findElement(By.css('button.css-1drvipl'));
        await workspaceMoreOptionsButton.click();
    } catch (error) {
        console.error('Could not find the "More options" button in workspace:', error.message);
        return;
    }

    // Wait for the "Download as Zip" option to appear and click it
    const downloadZipOption = await driver.wait(until.elementLocated(By.xpath("//span[text()='Download as zip']")), 10000);
    await downloadZipOption.click();

    // Wait some time to ensure download starts (adjust as needed)
    await driver.sleep(5000);

    console.log(`Completed downloads for Repl: ${replUrl}`);
}



