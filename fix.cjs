const fs = require('fs');
let content = fs.readFileSync('src/components/CatchUpQueue.tsx', 'utf-8');
content = content.replace(/<\/div><\/div>\n        <\/div>/g, '</div>\n        </div>');
fs.writeFileSync('src/components/CatchUpQueue.tsx', content);
