const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Админы (Telegram User IDs)
const ADMIN_IDS = ['920945194', '8050542983'];

// Путь к файлу с данными
const DATA_FILE = path.join(__dirname, 'analytics.json');

// Middleware
app.use(cors());
app.use(express.json());

// Логирование всех запросов
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ${req.method} ${req.path}`);
    if (req.query && Object.keys(req.query).length > 0) {
        console.log('Query params:', req.query);
    }
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Инициализация файла данных
async function initDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify([]), 'utf8');
    }
}

// Проверка админа
function isAdmin(userId) {
    return ADMIN_IDS.includes(String(userId));
}

// Чтение данных
async function readAnalytics() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading analytics:', error);
        return [];
    }
}

// Запись данных
async function writeAnalytics(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing analytics:', error);
        return false;
    }
}

// API: Сохранение/обновление аналитики пользователя
app.post('/api/analytics', async (req, res) => {
    console.log('\n=== POST /api/analytics START ===');
    try {
        const { userId, username, userLink, age, location, locationText, businessIntent, businessIntentText } = req.body;
        
        console.log('📥 Received data:', {
            userId,
            username,
            userLink,
            age,
            location,
            locationText,
            businessIntent,
            businessIntentText
        });

        if (!userId) {
            console.error('❌ userId is required');
            return res.status(400).json({ error: 'userId is required' });
        }

        console.log('📖 Reading analytics from file...');
        const analytics = await readAnalytics();
        console.log(`📊 Current analytics: ${analytics.length} users`);

        const userIndex = analytics.findIndex(u => u.userId === String(userId));
        const now = new Date().toISOString();

        if (userIndex === -1) {
            // Новый пользователь
            console.log('➕ Creating new user');
            const newUser = {
                userId: String(userId),
                username: username || 'Неизвестно',
                userLink: userLink || `tg://user?id=${userId}`,
                age: age !== undefined ? age : null,
                location: location !== undefined ? location : null,
                locationText: locationText !== undefined ? locationText : null,
                businessIntent: businessIntent !== undefined ? businessIntent : null,
                businessIntentText: businessIntentText !== undefined ? businessIntentText : null,
                firstVisit: now,
                lastVisit: now,
                visitsCount: 1
            };
            analytics.push(newUser);
            console.log('✅ New user created:', newUser);
        } else {
            // Обновление существующего пользователя
            console.log(`🔄 Updating existing user (index: ${userIndex})`);
            const user = analytics[userIndex];
            console.log('📝 Old user data:', JSON.stringify(user, null, 2));
            
            if (age !== undefined && age !== null) {
                user.age = age;
                console.log(`  ✓ Updated age: ${age}`);
            }
            if (location !== undefined) {
                user.location = location;
                user.locationText = locationText || null;
                console.log(`  ✓ Updated location: ${location} (${locationText})`);
            }
            if (businessIntent !== undefined) {
                user.businessIntent = businessIntent;
                user.businessIntentText = businessIntentText || null;
                console.log(`  ✓ Updated businessIntent: ${businessIntent} (${businessIntentText})`);
            }
            user.lastVisit = now;
            user.visitsCount = (user.visitsCount || 1) + 1;
            if (username) user.username = username;
            if (userLink) user.userLink = userLink;
            
            console.log('📝 Updated user data:', JSON.stringify(user, null, 2));
        }

        console.log('💾 Writing analytics to file...');
        const success = await writeAnalytics(analytics);
        if (success) {
            console.log(`✅ Analytics saved successfully. Total users: ${analytics.length}`);
            console.log('=== POST /api/analytics SUCCESS ===\n');
            res.json({ success: true, message: 'Analytics saved', totalUsers: analytics.length });
        } else {
            console.error('❌ Failed to write analytics to file');
            console.log('=== POST /api/analytics ERROR ===\n');
            res.status(500).json({ error: 'Failed to save analytics' });
        }
    } catch (error) {
        console.error('❌ Error in POST /api/analytics:', error);
        console.error('Error stack:', error.stack);
        console.log('=== POST /api/analytics ERROR ===\n');
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// API: Получение всей аналитики (только для админов)
app.get('/api/analytics', async (req, res) => {
    console.log('\n=== GET /api/analytics START ===');
    try {
        const adminUserId = req.query.adminUserId;
        
        console.log('👤 Admin user ID:', adminUserId);
        console.log('🔐 Checking admin access...');

        if (!adminUserId) {
            console.error('❌ adminUserId not provided');
            return res.status(400).json({ error: 'adminUserId is required' });
        }

        if (!isAdmin(adminUserId)) {
            console.error('❌ Access denied. User is not admin:', adminUserId);
            console.log('📋 Admin IDs:', ADMIN_IDS);
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        console.log('✅ Admin access granted');
        console.log('📖 Reading analytics from file...');
        const analytics = await readAnalytics();
        console.log(`📊 Total users in database: ${analytics.length}`);
        
        // Сортируем по дате последнего визита (новые сверху)
        const sortedAnalytics = [...analytics].sort((a, b) => 
            new Date(b.lastVisit || 0) - new Date(a.lastVisit || 0)
        );

        const stats = {
            totalUsers: analytics.length,
            completedOnboarding: analytics.filter(u => u.age !== null || u.location !== null).length,
            businessIntent: analytics.filter(u => u.businessIntent === 'business').length
        };

        console.log('📈 Statistics:', stats);
        console.log('📝 Returning sorted analytics:', sortedAnalytics.length, 'users');
        console.log('=== GET /api/analytics SUCCESS ===\n');

        res.json({ 
            success: true, 
            data: sortedAnalytics,
            stats: stats
        });
    } catch (error) {
        console.error('❌ Error in GET /api/analytics:', error);
        console.error('Error stack:', error.stack);
        console.log('=== GET /api/analytics ERROR ===\n');
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// API: Обновление данных пользователя
app.patch('/api/analytics/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;

        const analytics = await readAnalytics();
        const userIndex = analytics.findIndex(u => u.userId === String(userId));

        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Обновляем только переданные поля
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                analytics[userIndex][key] = updates[key];
            }
        });

        const success = await writeAnalytics(analytics);
        if (success) {
            res.json({ success: true, message: 'User updated', user: analytics[userIndex] });
        } else {
            res.status(500).json({ error: 'Failed to update user' });
        }
    } catch (error) {
        console.error('Error in PATCH /api/analytics/:userId:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Запуск сервера
async function startServer() {
    console.log('\n🚀 Starting Analytics Server...');
    console.log('📁 Initializing data file...');
    await initDataFile();
    console.log('✅ Data file initialized');
    
    app.listen(PORT, () => {
        console.log('\n✅ ============================================');
        console.log(`✅ Analytics server running on port ${PORT}`);
        console.log(`✅ Health check: http://localhost:${PORT}/health`);
        console.log(`✅ API endpoint: http://localhost:${PORT}/api/analytics`);
        console.log('✅ ============================================\n');
    });
}

startServer();

