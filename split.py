import os
import re

source_file = r'c:\Users\faraz\Desktop\hmi\script.js'
src_dir = r'c:\Users\faraz\Desktop\hmi\src'

with open(source_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure src and src/views exist
os.makedirs(os.path.join(src_dir, 'views'), exist_ok=True)

# Define regex patterns for sections
# SECTION 1: DAO LAYER
# SECTION 2: IMMUTABLE MODEL
# SECTION 3: MVI REDUCER
# SECTION 4: SCENARIO ENGINE
# SECTION 5: VIEW RENDERERS (views/render.js, charts.js, safety.js, alarm.js)
# SECTION 6: THREE.JS DIGITAL TWIN
# SECTION 7: MODAL HELPERS
# SECTION 8: DEMO BAR HELPERS
# SECTION 9: EVENT BINDINGS
# SECTION 10: AI COPILOT MESSAGING
# SECTION 11: CLOCK & DATA LOOP
# BOOTSTRAP

sections = re.split(r'// ═══════════════════════════════════════════════════════════════════\n// (SECTION \d+: .*|BOOTSTRAP)\s*\n// ═══════════════════════════════════════════════════════════════════\n', content)

# 0 is before first section (header comments)
# 1 is section name, 2 is content, 3 is section name, 4 is content, etc.

files = {
    'dao.js': '',
    'model.js': '',
    'reducer.js': '',
    'scenario-engine.js': '',
    'views/render.js': '',
    'three-twin.js': '',
    'events.js': '',
    'main.js': ''
}

header = sections[0]

for i in range(1, len(sections), 2):
    name = sections[i]
    text = sections[i+1]
    
    # Strip leading/trailing double lines if present
    text = re.sub(r'^// ═══════════════════════════════════════════════════════════════════\n', '', text)
    
    if 'SECTION 1:' in name:
        files['dao.js'] += text
    elif 'SECTION 2:' in name:
        files['model.js'] += text
    elif 'SECTION 3:' in name:
        files['reducer.js'] += text
    elif 'SECTION 4:' in name:
        files['scenario-engine.js'] += text
    elif 'SECTION 5:' in name or 'SECTION 7:' in name or 'SECTION 8:' in name or 'SECTION 10:' in name:
        files['views/render.js'] += text
    elif 'SECTION 6:' in name:
        files['three-twin.js'] += text
    elif 'SECTION 9:' in name:
        files['events.js'] += text
    elif 'SECTION 11:' in name or 'BOOTSTRAP' in name:
        files['main.js'] += text

for fname, fcontent in files.items():
    if fcontent.strip():
        with open(os.path.join(src_dir, fname), 'w', encoding='utf-8') as f:
            f.write("'use strict';\n\n" + fcontent.strip() + "\n")

print("Module split complete.")
