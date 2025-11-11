const axios = require('axios');

// 🔧 الإعدادات - يمكنك تعديلها لاحقاً
const API_KEY = "21c756eae3ffb458d1fcef45685aacb78b110c179dcea7128c2593e0fc8fdcf0";
const TELEGRAM_BOT_TOKEN = "8371336266:AAFSXC7UAGBA5hG4NulNV4l5tVyOmwuaAYU";
const FIREBASE_URL = "https://earn-money-c3bad-default-rtdb.firebaseio.com";
const MAX_AMOUNT = 0.001;

console.log('🚀 بدأ تشغيل بوت السحب التلقائي...');
console.log('⏰ سيعمل كل 30 ثانية تلقائياً');
console.log('📧 للإشعارات: @payment_proofs');

// 📡 طلب لـ Firebase
async function firebaseRequest(method, path, data = null) {
    try {
        const url = `${FIREBASE_URL}/${path}.json`;
        let response;

        if (method === 'GET') {
            response = await axios.get(url, { timeout: 10000 });
        } else if (method === 'PUT') {
            response = await axios.put(url, data, { timeout: 10000 });
        } else if (method === 'DELETE') {
            response = await axios.delete(url, { timeout: 10000 });
        } else if (method === 'PATCH') {
            response = await axios.patch(url, data, { timeout: 10000 });
        }

        return response.data;
    } catch (error) {
        console.log('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
        return null;
    }
}

// 📨 إرسال رسالة تليجرام
async function sendTelegramMessage(chatId, text) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await axios.post(url, {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        }, { timeout: 10000 });
        
        return response.data.ok === true;
    } catch (error) {
        console.log('❌ خطأ في إرسال رسالة تليجرام:', error.message);
        return false;
    }
}

// 🎭 إخفاء جزء من عنوان المحفظة
function maskAccount(account) {
    if (!account || account.length < 5) return account;
    
    const visibleStart = 2;
    const visibleEnd = 2;
    const maskedLength = account.length - visibleStart - visibleEnd;
    
    if (maskedLength <= 0) return account;
    
    const maskedPart = '*'.repeat(maskedLength);
    return account.substring(0, visibleStart) + maskedPart + account.substring(account.length - visibleEnd);
}

// 💰 معالجة الدفع عبر FaucetPay
async function processPayment(withdrawal) {
    try {
        console.log(`🔧 جاري معالجة: ${withdrawal.amount} TON إلى ${withdrawal.account}`);
        
        // 🚫 رفض الحسابات غير الموثقة
        if (withdrawal.account && withdrawal.account.includes('not verified')) {
            console.log('🚫 حساب غير موثق - مرفوض');
            await rejectWithdrawal(withdrawal.id, "This account is not verified");
            return { success: false, error: "This account is not verified" };
        }
        
        const amountSatoshi = Math.floor(withdrawal.amount * 100000000);
        
        const payload = new URLSearchParams({
            "api_key": API_KEY,
            "currency": "TON",
            "amount": amountSatoshi.toString(),
            "to": withdrawal.account
        });

        const response = await axios.post('https://faucetpay.io/api/v1/send', payload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 30000
        });

        const result = response.data;
        
        if (result.status === 200) {
            console.log(`✅ تم الدفع بنجاح! رقم المعاملة: ${result.payment_id}`);
            
            // 📧 إرسال إشعار نجاح للمستخدم
            await sendSuccessNotification(withdrawal, result.payment_id);
            
            // 📢 إرسال إشعار للقناة
            await sendChannelNotification(withdrawal, result.payment_id);
            
            return { success: true, transactionId: result.payment_id };
        } else {
            console.log(`❌ فشل الدفع: ${result.message}`);
            
            // إذا كان الخطأ بسبب حساب غير موثق
            if (result.message.includes('not verified')) {
                await rejectWithdrawal(withdrawal.id, result.message);
            } else {
                await sendFailureNotification(withdrawal, result.message);
            }
            
            return { success: false, error: result.message };
        }
        
    } catch (error) {
        console.log(`❌ خطأ في المعالجة: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ✅ إرسال إشعار نجاح للمستخدم
async function sendSuccessNotification(withdrawal, transactionId) {
    const userDisplay = withdrawal.userName || withdrawal.username || `User ${withdrawal.userId}`;
    const message = `✅ Withdrawal Successful!\n\nHey ${userDisplay}, your withdrawal of ${withdrawal.amount.toFixed(8)} TON from RealEarnBot_bot has been processed successfully 💸\n\nFunds are on their way — enjoy your crypto rewards and keep mining to reach even higher levels! 🚀\n\nYour consistency pays off — stay active and you might be tomorrow's top withdrawer 🏆`;
    
    if (withdrawal.userId) {
        await sendTelegramMessage(withdrawal.userId, message);
    }
}

// 📢 إرسال إشعار للقناة
async function sendChannelNotification(withdrawal, transactionId) {
    const userDisplay = withdrawal.userName || withdrawal.username || `User ${withdrawal.userId}`;
    const maskedAccount = maskAccount(withdrawal.account);
    const currentTime = new Date().toLocaleString('en-GB');
    
    const message = `💰 NEW WITHDRAWAL REQUEST 💰\n\n👤 User Information:\n• Name: ${userDisplay}\n• Username: ${withdrawal.username ? '@' + withdrawal.username : 'N/A'}\n• User ID: ${withdrawal.userId}\n\n💳 Withdrawal Details:\n• Amount: ${withdrawal.amount.toFixed(8)} TON\n• Method: ${withdrawal.method || 'FaucetPay'}\n• Wallet: ${maskedAccount}\n\n📅 Date & Time: ${currentTime}\n🆔 Request ID: ${withdrawal.id}\n\n✅ Status: Success Approval\n\nJoin bot @RealEarnBot_bot`;
    
    await sendTelegramMessage("@payment_proofs", message);
}

// ❌ إرسال إشعار فشل للمستخدم
async function sendFailureNotification(withdrawal, errorMessage) {
    const userDisplay = withdrawal.userName || withdrawal.username || `User ${withdrawal.userId}`;
    const message = `❌ Withdrawal Failed\n\nHey ${userDisplay}, your withdrawal of ${withdrawal.amount.toFixed(8)} TON could not be processed.\n\nReason: ${errorMessage}\n\nPlease check your wallet details and try again.`;
    
    if (withdrawal.userId) {
        await sendTelegramMessage(withdrawal.userId, message);
    }
}

// 🚫 رفض السحب نهائياً
async function rejectWithdrawal(withdrawalId, reason) {
    try {
        const withdrawalData = await firebaseRequest('GET', `withdrawals/pending/${withdrawalId}`);
        
        if (withdrawalData) {
            // نقل إلى المرفوضة
            const rejectedData = {
                ...withdrawalData,
                status: 'rejected',
                rejectionReason: reason,
                rejectedAt: Date.now(),
                rejectedBy: 'auto_payment_bot'
            };
            
            await firebaseRequest('PUT', `withdrawals/rejected/${withdrawalId}`, rejectedData);
            
            // حذف من المعلقة
            await firebaseRequest('DELETE', `withdrawals/pending/${withdrawalId}`);
            
            console.log(`🚫 تم رفض السحب ${withdrawalId} بسبب: ${reason}`);
            
            // إرسال إشعار رفض
            const userDisplay = withdrawalData.userName || withdrawalData.username || `User ${withdrawalData.userId}`;
            const rejectionMessage = `🚫 Withdrawal Rejected\n\nHey ${userDisplay}, your withdrawal of ${withdrawalData.amount.toFixed(8)} TON has been rejected.\n\nReason: ${reason}\n\nPlease contact support if you believe this is an error.`;
            
            if (withdrawalData.userId) {
                await sendTelegramMessage(withdrawalData.userId, rejectionMessage);
            }
        }
    } catch (error) {
        console.log('❌ خطأ في رفض السحب:', error.message);
    }
}

// 🔄 تحديث حالة السحب
async function updateWithdrawalStatus(withdrawalId, status, transactionId = null) {
    try {
        const withdrawalData = await firebaseRequest('GET', `withdrawals/pending/${withdrawalId}`);
        
        if (withdrawalData) {
            // نقل إلى المكتملة
            const completedData = {
                ...withdrawalData,
                status: status,
                transactionId: transactionId,
                processedAt: Date.now(),
                processedBy: 'auto_payment_bot'
            };
            
            await firebaseRequest('PUT', `withdrawals/completed/${withdrawalId}`, completedData);
            
            // حذف من المعلقة
            await firebaseRequest('DELETE', `withdrawals/pending/${withdrawalId}`);
            
            console.log(`✅ تم تحديث حالة السحب ${withdrawalId} إلى ${status}`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.log('❌ خطأ في تحديث حالة السحب:', error.message);
        return false;
    }
}

// 📥 جلب السحوبات المعلقة
async function fetchPendingWithdrawals() {
    try {
        const withdrawalsData = await firebaseRequest('GET', 'withdrawals/pending');
        
        const pendingWithdrawals = [];
        
        if (withdrawalsData) {
            Object.keys(withdrawalsData).forEach(withdrawalId => {
                const withdrawal = withdrawalsData[withdrawalId];
                if (withdrawal.status === 'pending') {
                    withdrawal.id = withdrawalId;
                    pendingWithdrawals.push(withdrawal);
                }
            });
            
            // ترتيب حسب الأقدم
            pendingWithdrawals.sort((a, b) => a.timestamp - b.timestamp);
        }
        
        return pendingWithdrawals;
        
    } catch (error) {
        console.log('❌ خطأ في جلب السحوبات:', error.message);
        return [];
    }
}

// 🎯 المعالجة الرئيسية لكل السحوبات
async function processAllWithdrawals() {
    try {
        console.log('🔄 جاري فحص السحوبات المعلقة...');
        
        const pendingWithdrawals = await fetchPendingWithdrawals();
        
        // تصفية السحوبات المؤهلة (FaucetPay + ضمن الحد)
        const eligibleWithdrawals = pendingWithdrawals.filter(w => 
            w.method === 'FaucetPay' && 
            w.amount <= MAX_AMOUNT
        );
        
        if (eligibleWithdrawals.length === 0) {
            console.log('📭 لا توجد سحوبات مؤهلة للمعالجة');
            return;
        }
        
        console.log(`🔧 وجدت ${eligibleWithdrawals.length} سحب مؤهل للمعالجة...`);
        
        let successfulCount = 0;
        let failedCount = 0;
        
        for (const withdrawal of eligibleWithdrawals) {
            const result = await processPayment(withdrawal);
            
            if (result.success) {
                await updateWithdrawalStatus(withdrawal.id, 'completed', result.transactionId);
                successfulCount++;
                console.log(`✅ تمت بنجاح: ${withdrawal.amount} TON`);
            } else {
                failedCount++;
                console.log(`❌ فشلت: ${withdrawal.amount} TON`);
            }
            
            // انتظار 5 ثواني بين كل عملية
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        console.log(`📊 النتائج: ${successfulCount} ناجحة - ${failedCount} فاشلة`);
        
        // إرسال تقرير نهائي
        if (successfulCount > 0) {
            const report = `📊 تقرير المعالجة\n• تم معالجة: ${successfulCount} سحب\n• فشلت: ${failedCount} سحب\n• الوقت: ${new Date().toLocaleString('ar-EG')}`;
            await sendTelegramMessage("@payment_proofs", report);
        }
        
    } catch (error) {
        console.log('❌ خطأ في المعالجة الرئيسية:', error.message);
    }
}

// ⏰ التشغيل التلقائي كل 30 ثانية
setInterval(processAllWithdrawals, 30000);

// 🚀 المعالجة الفورية عند البدء
console.log('🎯 بدء المعالجة الفورية...');
processAllWithdrawals();

// 📝 رسالة التأكيد
console.log('=================================');
console.log('✅ النظام يعمل بنجاح!');
console.log('⏰ سيفحص السحوبات كل 30 ثانية');
console.log('📧 الإشعارات ترسل لـ @payment_proofs');
console.log('🔧 لا حاجة لأي تدخل يدوي');
console.log('=================================');

// 🛡️ منع إيقاف البرنامج
process.on('uncaughtException', (error) => {
    console.log('🛡️ خطأ غير متوقع:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('🛡️ رفض وعد غير معالج:', reason);
});
