// Initialize Firebase Services
const auth = firebase.auth();
const db = firebase.firestore();

// Elements
const loginForm = document.getElementById("loginForm");
const loading = document.getElementById("loading");

// Helper: Show Inline Error
function showInlineError(fieldId, message) {
    let errorEl = document.getElementById(fieldId + "Error");
    if (!errorEl) {
        // Dynamically create inline error element if it doesn't exist in the HTML
        const inputEl = document.getElementById(fieldId);
        if (inputEl) {
            errorEl = document.createElement("div");
            errorEl.id = fieldId + "Error";
            errorEl.style.color = "#ef4444";
            errorEl.style.fontSize = "12px";
            errorEl.style.fontWeight = "500";
            errorEl.style.marginTop = "4px";
            inputEl.parentNode.insertBefore(errorEl, inputEl.nextSibling);
        }
    }
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = "block";
    }
}

// Helper: Clear All Inline Errors
function clearInlineErrors() {
    document.querySelectorAll("[id$='Error']").forEach(el => el.style.display = "none");
}

// Helper: Show Center Modal Error for Major Alerts
function showModalError(title, message) {
    let modal = document.getElementById("errorModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "errorModal";
        modal.style.cssText = "display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); z-index:9999; align-items:center; justify-content:center; padding:16px;";
        
        const content = document.createElement("div");
        content.style.cssText = "background:#fff; border-radius:16px; padding:24px; max-width:400px; width:100%; text-align:center; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); border: 1px solid #e5e5e5;";
        
        content.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size:48px; color:#ef4444; margin-bottom:16px;"></i>
            <h3 style="margin-bottom:8px; color:#171717; font-family:'Inter', sans-serif; font-weight:600;">${title}</h3>
            <p style="color:#737373; margin-bottom:24px; font-family:'Inter', sans-serif; font-size:14px;">${message}</p>
            <button id="closeModalBtn" style="background:transparent; border:1px solid #6366f1; color:#6366f1; padding:8px 24px; border-radius:6px; cursor:pointer; font-weight:500; text-transform:uppercase; letter-spacing:0.5px;">Close</button>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        document.getElementById("closeModalBtn").addEventListener("click", () => {
            modal.style.display = "none";
        });
    } else {
        modal.querySelector("h3").textContent = title;
        modal.querySelector("p").textContent = message;
        modal.style.display = "flex";
    }
}

// Login Submission
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearInlineErrors();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        
        // Handle optional role dropdown if it exists on your external page
        const roleEl = document.getElementById("role");
        const selectedRole = roleEl ? roleEl.value.trim().toLowerCase() : null;

        let hasError = false;
        if (!email) { showInlineError("email", "Email address is required."); hasError = true; }
        if (!password) { showInlineError("password", "Password is required."); hasError = true; }
        
        if (hasError) return;

        if (loading) loading.style.display = "block";

        try {
            // Firebase Login
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const uid = userCredential.user.uid;
            
            let userData = null;

            // Get Firestore User (Check 'user' collection first)
            const userDoc = await db.collection("user").doc(uid).get();

            if (userDoc.exists) {
                userData = userDoc.data();
            } else {
                // Fallback: Check 'employees' collection
                const empSnap = await db.collection("employees").where("uid", "==", uid).get();
                if (!empSnap.empty) {
                    userData = empSnap.docs[0].data();
                }
            }

            if (!userData) {
                await auth.signOut();
                showModalError("Profile Not Found", "Your user profile could not be located in the database.");
                if (loading) loading.style.display = "none";
                return;
            }

            // ============================================================
            //  SECURITY: INITIAL IP LOCK ENFORCEMENT CHECK
            // ============================================================
            if (userData.ipLock === 'true' || userData.ipLock === true) {
                try {
                    const ipRes = await fetch('https://api.ipify.org?format=json');
                    const ipData = await ipRes.json();
                    const userIp = ipData.ip;
                    
                    const setDoc = await db.collection('settings').doc('security').get();
                    const officeIp = setDoc.exists ? setDoc.data().officeIP : '';

                    if (officeIp && userIp !== officeIp) {
                        await auth.signOut();
                        showModalError("Access Denied", "Security Block: You must be connected to the authorized Office Network to log in.");
                        
                        // Silent security alert to Admin
                        await db.collection('notifications').add({
                            message: `SECURITY ALERT: ${userData.name || 'User'} attempted login from an unauthorized IP (${userIp}).`,
                            targetId: 'admin',
                            timestamp: new Date().toISOString(),
                            type: 'security'
                        });

                        if (loading) loading.style.display = "none";
                        return;
                    }
                } catch(err) {
                    await auth.signOut();
                    showModalError("Network Error", "Failed to verify secure network connection. Please check your internet and try again.");
                    if (loading) loading.style.display = "none";
                    return;
                }
            }
            // ============================================================

            const firestoreRole = (userData.role || "").trim().toLowerCase();

            // Only check role mismatch if a role selector exists on the page
            if (selectedRole && firestoreRole !== selectedRole) {
                await auth.signOut();
                showModalError("Role Mismatch", "The selected role does not match your account permissions.");
                if (loading) loading.style.display = "none";
                return;
            }

            // Save User Data for Session Management
            localStorage.setItem("userName", userData.name || "");
            localStorage.setItem("userEmail", userData.email || email);
            localStorage.setItem("userRole", firestoreRole);
            localStorage.setItem("userUid", uid);
            localStorage.setItem("userIpLock", userData.ipLock || "false");

            // Redirect based on role
            if (firestoreRole === "admin") {
                window.location.href = "admin.html";
            } else if (firestoreRole === "employee") {
                window.location.href = "employee.html";
            } else {
                await auth.signOut();
                showModalError("Invalid Role", "Your account does not have a valid role assigned.");
            }

        } catch (error) {
            console.error("Login Error:", error);
            
            // Handle specific Firebase auth errors for inline display
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
                showInlineError("email", "Invalid email address or account not found.");
            } else if (error.code === 'auth/wrong-password') {
                showInlineError("password", "Incorrect password.");
            } else if (error.code === 'auth/too-many-requests') {
                showModalError("Account Locked", "Too many failed login attempts. Please try again later for security purposes.");
            } else {
                // Catch-all for other errors via Modal
                showModalError("Login Failed", error.message);
            }
        } finally {
            if (loading) loading.style.display = "none";
        }
    });
}