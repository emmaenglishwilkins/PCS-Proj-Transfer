// init

const { Builder, By, Browser, until } = require('selenium-webdriver');
const readline = require('readline');
const fs = require('fs');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let projectNames = [];
let hrefs;
let email = '';
let password = '';
let timeData = 30;
let teamName = 'ics4u-40-buckland';
let browser = 'CHROME';

function askQuestion(question) {
    return new Promise((resolve, reject) => {
        function prompt() {
            rl.question(question, (answer) => {
                if (answer.trim() !== '') {
                    resolve(answer);
                } else {
                    console.log(
                        '\x1b[31m%s\x1b[0m',
                        'Please provide a non-empty answer.'
                    );
                    prompt(); // Prompt again
                }
            });
        }
        prompt(); // Initial prompt
    });
}

async function getUserInput() {
    console.log(
        '\x1b[34m%s\x1b[0m',
        'Information Required to Run Program (not collected):'
    );

    teamName = await askQuestion(
        'What is your team name (e.g. ics4u-40-buckland): '
    );
    email = await askQuestion('Enter your email: ');
    password = await askQuestion('Enter your password: ');
    console.log(
        '\x1b[31m%s\x1b[0m',
        "\nThis next question is pretty important, if your internet is slow, you'll want to increase the time between project downloads. If your internet is fast, you can decrease the time between project downloads. The default is 30 seconds."
    );
    timeData = await askQuestion(
        'How long should we wait between project downloads (type in a number in seconds): '
    );
    while (isNaN(timeData)) {
        console.log('Please enter a valid number.');
        timeData = await askQuestion(
            'How long should we wait between project downloads (type in a number in seconds): '
        );
    }
    let confirmation = await askQuestion(
        `Are you absolutely sure that you want to timeout for *\x1b[34m${timeData}\x1b[0m* seconds between project downloads? (yes/no): `
    );
    if (confirmation.toLowerCase() !== 'yes') {
        console.log(
            '\x1b[31m%s\x1b[0m',
            '\nPlease restart the program and enter a valid number'
        );
        process.exit(0);
    }
    browser = await askQuestion(
        `What browser would you like to use from \x1b[34mCHROME, EDGE, FIREFOX, SAFARI \x1b[0m (only Chrome support is guaranteed): `
    );
    browser = browser.toUpperCase();
    while (
        browser.toLowerCase() !== 'chrome' &&
        browser.toLowerCase() !== 'edge' &&
        browser.toLowerCase() !== 'firefox' &&
        browser.toLowerCase() !== 'safari'
    ) {
        console.log('CHROME, EDGE, FIREFOX, SAFARI');
        browser = await askQuestion(
            `What browser would you like to use (only Chrome support is guaranteed): `
        );
        browser = browser.toUpperCase();
    }
    rl.close();
}
process.on('SIGINT', function () {
    console.log('/n So you want to exit? 😄');
    process.exit();
});
getUserInput().catch((error) => {
    console.error(error); // Fine, we'll throw the error
});

rl.on('close', () => {
    console.log('\n\x1b[34mStarting download processes\x1b[0m');
    console.log(
        'Using email and password to login: ' +
            email +
            ' and ' +
            password +
            ' on browser ' +
            browser
    );

    (async function () {
        const driver = await new Builder().forBrowser(Browser[browser]).build();

        function getRandomDelay(base, variance) {
            return base + Math.floor(Math.random() * variance);
        }

        async function typeText(element, text) {
            for (const char of text) {
                await element.sendKeys(char);
                await new Promise(resolve => setTimeout(resolve, getRandomDelay(100, 300)));
            }
        }

        try {
            await driver.get('https://replit.com/login');

            // Login Process with typing simulation
            const emailField = await driver.findElement({ id: 'username-:r0:' });
            const passwordField = await driver.findElement({ id: 'password-:r6:' });
            await typeText(emailField, email);
            await typeText(passwordField, password);
            await new Promise(resolve => setTimeout(resolve, getRandomDelay(500, 1000)));

            await driver.findElement(By.css('[data-cy="log-in-btn"]')).click();

            // Wait for login to complete with a random delay
            await driver.wait(until.elementLocated(By.css('[data-cy="home-text"]')), 10000);
            await new Promise(resolve => setTimeout(resolve, getRandomDelay(500, 1000)));

            // Simulate scrolling to the bottom of the page
            await driver.executeScript('window.scrollTo(0, document.body.scrollHeight / 2);');
            await new Promise(resolve => setTimeout(resolve, getRandomDelay(1000, 2000)));

            // Switch to the personal projects page
			await driver.get('https://replit.com/repls'); // URL for personal Replit projects

            await driver.get('https://replit.com/team/' + teamName);

            // Find all <a> elements with href containing the teamName
            const links = await driver.findElements(
                By.xpath(
                    '//a[contains(@href, "@' +
                        teamName +
                        '/") and contains(text(), "Continue working")]'
                )
            );
            console.log('Got all the links to the projects');

            // Extract href attribute values and store them in an array
            hrefs = await Promise.all(
                links.map(async (link) => {
                    return await link.getAttribute('href');
                })
            );
            console.log('Getting relevant download elements');
            if (hrefs.length === 0) {
                waitForProjectsToLoad(driver);
                hrefs = await Promise.all(
                    links.map(async (link) => {
                        return await link.getAttribute('href');
                    })
                );
            }
            console.log('\nDownloading projects');
            for (let i = 0; i < hrefs.length; i++) {
                const url = hrefs[i] + '.zip';
                console.log(url);
                await driver.executeScript(`window.open('${url}', '_blank');`);
                await new Promise((resolve) =>
                    setTimeout(resolve, timeData * 1000)
                );
            }
        } catch (error) {
            console.error(error);
        } finally {
            await driver.quit();
        }

        for (let i = 0; i < hrefs.length; i++) {
            const projectNamePart = hrefs[i].replace(
                new RegExp(`^https://replit.com/@${teamName}/`),
                ''
            );
            projectNames.push(projectNamePart + '.zip');
        }
        fs.writeFileSync('.projekts', projectNames.join('\n'));
    })();
    console.log(
        'All projects downloaded, program complete, now run `bash projectSorter.sh`'
    );
});

async function waitForProjectsToLoad(driver) {
    await driver.wait(
        until.elementLocated(
            By.css('[data-cy="team-stack-item-title-1.16 Ex8_Hangman"]')
        ),
        10000
    );
    const element = await driver.findElement(
        By.css('[data-cy="team-stack-item-title-1.16 Ex8_Hangman"]')
    );
    return element;
}

