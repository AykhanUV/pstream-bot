const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { clientId, token } = require('./config.json'); 
const fs = require('node:fs');
const path = require('node:path');


const faqPath = path.join(__dirname, 'faq.json');
const faqData = JSON.parse(fs.readFileSync(faqPath, 'utf8'));

const faqChoices = faqData.map(item => ({
    name: item.topic.replace(/_/g, ' '), 
    value: item.topic 
}));


const commands = [];


const rest = new REST({ version: '10' }).setToken(token);


(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        
        if (!clientId) {
            throw new Error('clientId is missing in config.json. Please add it.');
        }

        
        
        
        
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        
        console.error(error);
    }
})();