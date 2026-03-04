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
    try {
        const { userId, username, userLink, age, location, locationText, businessIntent, businessIntentText } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const analytics = await readAnalytics();
        const userIndex = analytics.findIndex(u => u.userId === String(userId));

        const now = new Date().toISOString();

        if (userIndex === -1) {
            // Новый пользователь
            analytics.push({
                userId: String(userId),
                username: username || 'Неизвестно',
                userLink: userLink || `tg://user?id=${userId}`,
                age: age || null,
                location: location || null,
                locationText: locationText || null,
                businessIntent: businessIntent || null,
                businessIntentText: businessIntentText || null,
                firstVisit: now,
                lastVisit: now,
                visitsCount: 1
            });
        } else {
            // Обновление существующего пользователя
            const user = analytics[userIndex];
            if (age !== undefined) user.age = age;
            if (location !== undefined) {
                user.location = location;
                user.locationText = locationText;
            }
            if (businessIntent !== undefined) {
                user.businessIntent = businessIntent;
                user.businessIntentText = businessIntentText;
            }
            user.lastVisit = now;
            user.visitsCount = (user.visitsCount || 1) + 1;
            if (username) user.username = username;
            if (userLink) user.userLink = userLink;
        }

        const success = await writeAnalytics(analytics);
        if (success) {
            res.json({ success: true, message: 'Analytics saved' });
        } else {
            res.status(500).json({ error: 'Failed to save analytics' });
        }
    } catch (error) {
        console.error('Error in POST /api/analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API: Получение всей аналитики (только для админов)
app.get('/api/analytics', async (req, res) => {
    try {
        const adminUserId = req.query.adminUserId;

        if (!adminUserId || !isAdmin(adminUserId)) {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const analytics = await readAnalytics();
        
        // Сортируем по дате последнего визита (новые сверху)
        const sortedAnalytics = [...analytics].sort((a, b) => 
            new Date(b.lastVisit || 0) - new Date(a.lastVisit || 0)
        );

        res.json({ 
            success: true, 
            data: sortedAnalytics,
            stats: {
                totalUsers: analytics.length,
                completedOnboarding: analytics.filter(u => u.age !== null || u.location !== null).length,
                businessIntent: analytics.filter(u => u.businessIntent === 'business').length
            }
        });
    } catch (error) {
        console.error('Error in GET /api/analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
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
    await initDataFile();
    app.listen(PORT, () => {
        console.log(`Analytics server running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health`);
    });
}

startServer();

