document.addEventListener("DOMContentLoaded", function () {
    const path = window.location.pathname;
    const page = path.split("/").pop();

    function getFileName(inputId, defaultKey) {
        const input = document.getElementById(inputId);
        if (input && input.files.length > 0) {
            return input.files[0].name;
        }
        return sessionStorage.getItem(defaultKey) || "";
    }

    // =========================================================================
    // STEP 1: Registration Page (registration.html)
    // =========================================================================
    const regForm = document.getElementById("regForm");
    if (regForm) {
        regForm.removeAttribute("action");

        if (!sessionStorage.getItem("is_navigating")) {
            sessionStorage.clear();
        }
        sessionStorage.setItem("is_navigating", "true");

        // Populate fields from sessionStorage if navigating back
        if (sessionStorage.getItem("studentName")) document.getElementById("studentName").value = sessionStorage.getItem("studentName");
        if (sessionStorage.getItem("mobileNo")) document.getElementById("mobileNo").value = sessionStorage.getItem("mobileNo");
        if (sessionStorage.getItem("emailId")) document.getElementById("emailId").value = sessionStorage.getItem("emailId");
        if (sessionStorage.getItem("idProofType")) document.getElementById("idProofType").value = sessionStorage.getItem("idProofType");
        if (sessionStorage.getItem("address")) document.getElementById("address").value = sessionStorage.getItem("address");

        const userPhotoInput = document.getElementById("userPhoto");
        const idFileInput = document.getElementById("idFile");

        if (userPhotoInput && sessionStorage.getItem("photoName")) {
            userPhotoInput.nextElementSibling.querySelector("span").textContent = sessionStorage.getItem("photoName");
        }
        if (idFileInput && sessionStorage.getItem("idName")) {
            idFileInput.nextElementSibling.querySelector("span").textContent = sessionStorage.getItem("idName");
        }

        if (userPhotoInput) {
            userPhotoInput.addEventListener("change", function () {
                const span = this.nextElementSibling.querySelector("span");
                if (this.files.length > 0) span.textContent = this.files[0].name;
            });
        }
        if (idFileInput) {
            idFileInput.addEventListener("change", function () {
                const span = this.nextElementSibling.querySelector("span");
                if (this.files.length > 0) span.textContent = this.files[0].name;
            });
        }

        regForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const photoName = getFileName("userPhoto", "photoName");
            const idName = getFileName("idFile", "idName");

            if (!photoName && !sessionStorage.getItem("photoPath")) {
                alert("Please upload your photo before proceeding!");
                return;
            }
            if (!idName && !sessionStorage.getItem("idPath")) {
                alert("Please upload a valid ID proof before proceeding!");
                return;
            }

            // Create a FormData to upload files via server API
            const formData = new FormData();
            if (userPhotoInput && userPhotoInput.files.length > 0) {
                formData.append("userPhoto", userPhotoInput.files[0]);
            }
            if (idFileInput && idFileInput.files.length > 0) {
                formData.append("idFile", idFileInput.files[0]);
            }

            // Upload files if newly selected
            if (formData.has("userPhoto") || formData.has("idFile")) {
                const btn = regForm.querySelector(".btn-next");
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = `Uploading Files... <i class="fa-solid fa-spinner fa-spin"></i>`;

                fetch('/api/upload-temp', {
                    method: 'POST',
                    body: formData
                })
                .then(res => res.json())
                .then(data => {
                    btn.disabled = false;
                    btn.innerHTML = originalText;

                    if (data.success) {
                        if (data.data.photoPath) {
                            sessionStorage.setItem("photoPath", data.data.photoPath);
                            sessionStorage.setItem("photoName", data.data.photoName);
                        }
                        if (data.data.idPath) {
                            sessionStorage.setItem("idPath", data.data.idPath);
                            sessionStorage.setItem("idName", data.data.idName);
                        }
                        saveDetailsAndProceed();
                    } else {
                        alert("File upload failed: " + data.message);
                    }
                })
                .catch(err => {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    console.error("Upload error:", err);
                    alert("Error connection failed while uploading files.");
                });
            } else {
                saveDetailsAndProceed();
            }

            function saveDetailsAndProceed() {
                sessionStorage.setItem("studentName", document.getElementById("studentName").value);
                sessionStorage.setItem("mobileNo", document.getElementById("mobileNo").value);
                sessionStorage.setItem("emailId", document.getElementById("emailId").value);
                sessionStorage.setItem("idProofType", document.getElementById("idProofType").value);
                sessionStorage.setItem("address", document.getElementById("address").value);
                window.location.href = "plan.html";
            }
        });
    }

    // =========================================================================
    // STEP 2: Choose Plan Page (plan.html)
    // =========================================================================
    const planForm = document.getElementById("planForm");
    const slotSelect = document.getElementById("slot");
    const durationSelect = document.getElementById("duration");

    if (planForm && slotSelect && durationSelect) {
        planForm.removeAttribute("action");

        let infoDiv = document.getElementById("slot-info-preview");
        if (!infoDiv) {
            infoDiv = document.createElement("div");
            infoDiv.id = "slot-info-preview";
            infoDiv.style.marginTop = "8px";
            infoDiv.style.fontSize = "13px";
            infoDiv.style.color = "#007bff";
            infoDiv.style.fontWeight = "600";
            slotSelect.closest(".input-group").appendChild(infoDiv);
        }

        let originalOptionsText = {
            "6-12": "Morning (06:00 AM - 12:00 PM)",
            "12-6": "Afternoon (12:00 PM - 06:00 PM)",
            "6-24": "Evening (06:00 PM - 12:00 AM)",
            "24-6": "Night (12:00 AM - 06:00 AM)"
        };

        if (sessionStorage.getItem("mainPlan")) document.getElementById("mainPlan").value = sessionStorage.getItem("mainPlan");
        if (sessionStorage.getItem("duration")) durationSelect.value = sessionStorage.getItem("duration");
        if (sessionStorage.getItem("startSlotRaw")) slotSelect.value = sessionStorage.getItem("startSlotRaw");

        let slotSequence = ["6-12", "12-6", "6-24", "24-6"];
        let slotNamesMapping = {
            "6-12": "Morning",
            "12-6": "Afternoon",
            "6-24": "Evening",
            "24-6": "Night"
        };

        // Fetch dynamic pricing matrix on load
        fetch('/api/plans/prices')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    sessionStorage.setItem("pricesMatrix", JSON.stringify(data.prices));
                }
            })
            .catch(err => console.error("Error loading pricing matrix:", err));

        // Fetch dynamic slots on load
        fetch('/api/slots')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.slots && data.slots.length > 0) {
                    slotSequence = [];
                    slotNamesMapping = {};
                    originalOptionsText = {};

                    const placeholder = slotSelect.querySelector("option[disabled]");
                    slotSelect.innerHTML = "";
                    if (placeholder) slotSelect.appendChild(placeholder);

                    data.slots.forEach(s => {
                        slotSequence.push(s.value);
                        slotNamesMapping[s.value] = s.name;
                        originalOptionsText[s.value] = s.display;

                        const opt = document.createElement("option");
                        opt.value = s.value;
                        opt.textContent = s.display;
                        slotSelect.appendChild(opt);
                    });

                    if (sessionStorage.getItem("startSlotRaw")) {
                        slotSelect.value = sessionStorage.getItem("startSlotRaw");
                    }
                    calculateAndShowSlots();
                }
            })
            .catch(err => console.error("Error loading slots dynamically:", err));

        const calculateAndShowSlots = () => {
            const hours = durationSelect.value;
            let chosenStart = slotSelect.value;

            for (let val in originalOptionsText) {
                const opt = slotSelect.querySelector(`option[value="${val}"]`);
                if (opt) opt.textContent = originalOptionsText[val];
            }

            if (hours === "24") {
                const firstVal = slotSequence[0] || "6-12";
                slotSelect.value = firstVal;
                slotSelect.setAttribute("disabled", "true");
                
                const allSlotNames = slotSequence.map(val => slotNamesMapping[val]);
                infoDiv.textContent = "Auto Booked: " + allSlotNames.join(", ") + " (Full Day)";

                const opt = slotSelect.querySelector(`option[value="${firstVal}"]`);
                if (opt) opt.textContent = `Full Day (${allSlotNames.length} Slots Auto-Selected)`;
                return;
            } else {
                slotSelect.removeAttribute("disabled");
            }

            if (!chosenStart) {
                infoDiv.textContent = "";
                return;
            }

            let startIndex = slotSequence.indexOf(chosenStart);
            let requiredCount = parseInt(hours) / 6;
            let finalSlots = [];

            for (let i = 0; i < requiredCount; i++) {
                let currentIndex = (startIndex + i) % slotSequence.length;
                finalSlots.push(slotNamesMapping[slotSequence[currentIndex]]);
            }

            if (hours === "12" || hours === "18") {
                const activeOption = slotSelect.querySelector(`option[value="${chosenStart}"]`);
                if (activeOption) {
                    activeOption.textContent = `[${requiredCount} Slots Selected] ${finalSlots.join(" + ")}`;
                }
                infoDiv.textContent = `Selected Chain: ${finalSlots.join(", ")}`;
            } else {
                infoDiv.textContent = `Selected Slot: ${finalSlots[0]}`;
            }
        };

        durationSelect.addEventListener("change", calculateAndShowSlots);
        slotSelect.addEventListener("change", calculateAndShowSlots);
        calculateAndShowSlots();

        planForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const mainPlan = document.getElementById("mainPlan").value;
            const duration = durationSelect.value;
            const chosenStart = slotSelect.value;

            if (!mainPlan || !duration || (!chosenStart && duration !== "24")) {
                alert("Please select your plan, duration and slot.");
                return;
            }

            let finalSlotsArray = [];
            const firstVal = slotSequence[0] || "6-12";
            let startIndex = slotSequence.indexOf(duration === "24" ? firstVal : chosenStart);
            let requiredCount = parseInt(duration) / 6;

            for (let i = 0; i < requiredCount; i++) {
                let currentIndex = (startIndex + i) % slotSequence.length;
                finalSlotsArray.push(slotNamesMapping[slotSequence[currentIndex]]);
            }

            sessionStorage.setItem("mainPlan", mainPlan);
            sessionStorage.setItem("duration", duration);
            sessionStorage.setItem("startSlotRaw", duration === "24" ? firstVal : chosenStart);
            sessionStorage.setItem("slot", finalSlotsArray.join(", "));

            // Lookup prices dynamically from fetched prices matrix
            const pricesStr = sessionStorage.getItem("pricesMatrix");
            let finalBasePrice = 0;
            if (pricesStr) {
                const matrix = JSON.parse(pricesStr);
                if (matrix[duration] && matrix[duration][mainPlan] !== undefined) {
                    finalBasePrice = parseFloat(matrix[duration][mainPlan]);
                }
            }

            if (finalBasePrice === 0) {
                // Fallback hardcoded logic if server pricing load failed
                let basePrice = 500.00;
                if (mainPlan === "1w") basePrice = 300.00;
                if (mainPlan === "3m") basePrice = 1300.00;
                if (mainPlan === "6m") basePrice = 2500.00;
                finalBasePrice = basePrice * requiredCount;
            }

            const gst = finalBasePrice * 0.05;
            const total = finalBasePrice + gst;

            sessionStorage.setItem("planPrice", finalBasePrice.toFixed(2));
            sessionStorage.setItem("gstAmount", gst.toFixed(2));
            sessionStorage.setItem("totalAmount", total.toFixed(2));

            window.location.href = "slot.html";
        });
    }

    // =========================================================================
    // STEP 3: Seat Selection Page (slot.html)
    // =========================================================================
    const paginationEl = document.getElementById("dynamic-pagination");
    if (paginationEl) {
        const savedSlotString = sessionStorage.getItem("slot") || "Morning";
        const userSlotsChain = savedSlotString.split(", ").map(s => s.trim());

        // Fetch dynamic slot details first to construct DOM containers as needed
        fetch('/api/slots')
            .then(res => res.json())
            .then(data => {
                const slots = data.success ? data.slots : [];
                const mapWrapper = document.querySelector(".time-slot-card");

                const slotIdMap = {
                    "Morning": "slot-morning",
                    "Afternoon": "slot-afternoon",
                    "Evening": "slot-evening",
                    "Night": "slot-night"
                };

                let validContainers = [];

                userSlotsChain.forEach(slotName => {
                    let id = slotIdMap[slotName];
                    let el = document.getElementById(id);

                    if (!el) {
                        const slotObj = slots.find(s => s.name === slotName);
                        if (slotObj) {
                            id = `slot-${slotObj.value}`;
                            el = document.getElementById(id);
                            if (!el) {
                                // Create custom slot container dynamically
                                el = document.createElement("div");
                                el.className = "slot-container";
                                el.id = id;
                                el.setAttribute("data-slot-name", slotObj.name);
                                el.setAttribute("data-slot-time", slotObj.display);
                                el.style.display = "none";

                                let seatsHtml = `
                                    <div class="slot-header">
                                        <span class="slot-title">Seat Status (${slotObj.name})</span>
                                        <span class="slot-time">${slotObj.display}</span>
                                    </div>
                                    <div class="seats-grid">
                                `;
                                for (let row of ['A', 'B', 'C']) {
                                    for (let i = 1; i <= 10; i++) {
                                        seatsHtml += `<div class="seat available" data-seat="${row}${i}">${row}${i}</div>`;
                                    }
                                }
                                seatsHtml += `</div>`;
                                el.innerHTML = seatsHtml;
                                mapWrapper.insertBefore(el, paginationEl);
                            }
                        }
                    }

                    if (el) validContainers.push(el);
                });

                if (validContainers.length === 0) {
                    const fallback = document.getElementById("slot-morning");
                    if (fallback) validContainers.push(fallback);
                }

                initializeSeatSelectionFlow(validContainers, savedSlotString);
            })
            .catch(err => {
                console.error("Error fetching slot parameters:", err);
                const slotIdMap = {
                    "Morning": "slot-morning",
                    "Afternoon": "slot-afternoon",
                    "Evening": "slot-evening",
                    "Night": "slot-night"
                };
                let validContainers = [];
                userSlotsChain.forEach(slotName => {
                    const id = slotIdMap[slotName];
                    const el = document.getElementById(id);
                    if (el) validContainers.push(el);
                });
                if (validContainers.length === 0) {
                    validContainers.push(document.getElementById("slot-morning"));
                }
                initializeSeatSelectionFlow(validContainers, savedSlotString);
            });

        function initializeSeatSelectionFlow(validContainers, savedSlotString) {
            let currentActiveIndex = 0;
            const dotsWrapper = paginationEl.querySelector(".dots-wrapper");
            const prevBtn = paginationEl.querySelector(".prev-btn");
            const nextBtn = paginationEl.querySelector(".next-btn");

            function renderPagination() {
                dotsWrapper.innerHTML = "";
                validContainers.forEach((container, index) => {
                    const dot = document.createElement("span");
                    dot.className = `pagination-dot ${index === currentActiveIndex ? "active" : ""}`;
                    dot.addEventListener("click", () => {
                        switchSlot(index);
                    });
                    dotsWrapper.appendChild(dot);
                });
            }

            function switchSlot(index) {
                validContainers[currentActiveIndex].style.display = "none";
                currentActiveIndex = index;
                validContainers[currentActiveIndex].style.display = "block";

                const dots = dotsWrapper.querySelectorAll(".pagination-dot");
                dots.forEach((d, i) => {
                    if (i === currentActiveIndex) d.classList.add("active");
                    else d.classList.remove("active");
                });

                const activeSlotName = validContainers[currentActiveIndex].getAttribute("data-slot-name");
                const slotTimeSpan = document.querySelector(".slot-time");
                if (slotTimeSpan && !slotTimeSpan.closest(".slot-header")) {
                    slotTimeSpan.textContent = `Selected Slots: ${savedSlotString} (Viewing: ${activeSlotName})`;
                }
            }

            prevBtn.addEventListener("click", () => {
                if (currentActiveIndex > 0) switchSlot(currentActiveIndex - 1);
            });

            nextBtn.addEventListener("click", () => {
                if (currentActiveIndex < validContainers.length - 1) switchSlot(currentActiveIndex + 1);
            });

            document.querySelectorAll(".slot-container").forEach(el => el.style.display = "none");
            validContainers[0].style.display = "block";
            renderPagination();

            // Fetch real-time seat availability from backend
            fetch(`/api/seats/status?slots=${encodeURIComponent(savedSlotString)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.bookedSeats) {
                        data.bookedSeats.forEach(seatCode => {
                            document.querySelectorAll(`.slot-container .seat[data-seat="${seatCode}"]`).forEach(s => {
                                s.className = "seat booked";
                            });
                        });
                    }

                    // Apply saved selection if any
                    const savedSeatCode = sessionStorage.getItem("selectedSeat");
                    if (savedSeatCode) {
                        document.querySelectorAll(`.slot-container .seat[data-seat="${savedSeatCode}"]`).forEach(s => {
                            if (s.classList.contains("available")) {
                                s.classList.add("selected");
                            }
                        });
                    }

                    setupSeatClickEvents();
                })
                .catch(err => {
                    console.error("Error fetching seat statuses:", err);
                    setupSeatClickEvents();
                });

            function setupSeatClickEvents() {
                const allAvailableSeats = document.querySelectorAll(".slot-container .seat.available");
                allAvailableSeats.forEach(seat => {
                    seat.addEventListener("click", () => {
                        const seatCode = seat.getAttribute("data-seat");
                        const isCurrentlySelected = seat.classList.contains("selected");

                        if (isCurrentlySelected) {
                            document.querySelectorAll(`.slot-container .seat[data-seat="${seatCode}"]`).forEach(s => {
                                s.classList.remove("selected");
                            });
                            sessionStorage.removeItem("selectedSeat");
                            return;
                        }

                        let isAvailableInAllSlots = true;
                        let conflictSlots = [];

                        validContainers.forEach(container => {
                            const seatInSlot = container.querySelector(`.seat[data-seat="${seatCode}"]`);
                            const slotName = container.getAttribute("data-slot-name") || "this shift";

                            if (!seatInSlot || !seatInSlot.classList.contains("available")) {
                                isAvailableInAllSlots = false;
                                conflictSlots.push(slotName);
                            }
                        });

                        if (!isAvailableInAllSlots) {
                            alert(`Sorry! Seat ${seatCode} is not available for your selected duration because it is already booked in the ${conflictSlots.join(" and ")} shift. Please choose another seat.`);
                            return;
                        }

                        document.querySelectorAll(".slot-container .seat.selected").forEach(s => {
                            s.classList.remove("selected");
                        });

                        validContainers.forEach(container => {
                            const targetSeat = container.querySelector(`.seat[data-seat="${seatCode}"]`);
                            if (targetSeat) {
                                targetSeat.classList.add("selected");
                            }
                        });

                        sessionStorage.setItem("selectedSeat", seatCode);
                    });
                });
            }
        }

        const confirmSeatBtn = document.querySelector(".btn-next");
        if (confirmSeatBtn) {
            confirmSeatBtn.removeAttribute("onclick");
            const newConfirmBtn = confirmSeatBtn.cloneNode(true);
            confirmSeatBtn.parentNode.replaceChild(newConfirmBtn, confirmSeatBtn);

            newConfirmBtn.addEventListener("click", function (e) {
                e.preventDefault();
                if (!sessionStorage.getItem("selectedSeat")) {
                    alert("Please select a seat from your active slot to proceed.");
                } else if (sessionStorage.getItem("upgradeMode") === "true") {
                    // Upgrade flow: skip registration review entirely and go straight
                    // to a payment that charges only for the new plan.
                    window.location.href = "payment.html";
                } else {
                    window.location.href = "review.html";
                }
            });
        }
    }

    // =========================================================================
    // STEP 4: Review Details Page (review.html)
    // =========================================================================
    if (page === "review.html" || path.includes("review")) {
        const reviewValues = document.querySelectorAll(".review-value");
        const boldTexts = document.querySelectorAll(".review-text-bold");
        const addressText = document.querySelector(".review-text-address");

        if (reviewValues.length >= 4) {
            const planMapping = { "1w": "1 Week", "1m": "1 Month", "3m": "3 Months", "6m": "6 Months" };
            reviewValues[0].textContent = planMapping[sessionStorage.getItem("mainPlan")] || "1 Month";
            reviewValues[1].textContent = (sessionStorage.getItem("duration") || "6") + " Hours";
            reviewValues[2].textContent = sessionStorage.getItem("slot") || "Morning";
            reviewValues[3].textContent = sessionStorage.getItem("selectedSeat") || "None";
        }

        if (boldTexts.length >= 2) {
            boldTexts[0].textContent = sessionStorage.getItem("studentName") || "";
            boldTexts[1].textContent = sessionStorage.getItem("mobileNo") || "";
            if (boldTexts[2]) boldTexts[2].textContent = sessionStorage.getItem("emailId") || "";
        }
        if (addressText) addressText.textContent = sessionStorage.getItem("address") || "";

        const fileNames = document.querySelectorAll(".file-name");
        if (fileNames.length >= 2) {
            fileNames[0].textContent = sessionStorage.getItem("photoName") || "Not Uploaded";
            fileNames[1].textContent = sessionStorage.getItem("idName") || "Not Uploaded";
        }

        const prices = document.querySelectorAll(".billing-price, .total-amount-box");
        const payBtn = document.querySelector(".btn-next");

        const finalAmt = sessionStorage.getItem("totalAmount") || "0.00";
        if (prices.length >= 3) {
            prices[0].textContent = "₹" + (sessionStorage.getItem("planPrice") || "0.00");
            prices[1].textContent = "₹" + (sessionStorage.getItem("gstAmount") || "0.00");
            prices[2].textContent = "₹" + finalAmt;
        }

        if (payBtn) {
            payBtn.removeAttribute("onclick");
            payBtn.innerHTML = `Pay Amount ₹${finalAmt} <i class="fa-solid fa-lock"></i>`;

            payBtn.addEventListener("click", function () {
                const cb = document.querySelector(".confirm-checkbox");
                if (cb && !cb.checked) {
                    alert("Please confirm the verification checkbox before paying.");
                } else {
                    sessionStorage.removeItem("is_navigating");
                    window.location.href = "payment.html";
                }
            });
        }
    }

    // =========================================================================
    // STEP 5: Payment Page (payment.html)
    // =========================================================================
    if (page === "payment.html" || path.includes("payment")) {
        const totalAmount = sessionStorage.getItem("totalAmount") || "0.00";
        const finalPayBtn = document.getElementById("finalPayBtn");

        if (finalPayBtn) {
            finalPayBtn.innerHTML = `Pay Amount ₹${totalAmount} <i class="fa-solid fa-lock"></i>`;
        }

        const tabs = document.querySelectorAll(".pay-tab");
        const panels = document.querySelectorAll(".pay-panel");

        tabs.forEach(tab => {
            tab.addEventListener("click", function () {
                tabs.forEach(t => t.classList.remove("active"));
                panels.forEach(p => p.classList.remove("active"));

                this.classList.add("active");
                const targetId = this.getAttribute("data-target");
                document.getElementById(targetId).classList.add("active");
            });
        });

        const upiApps = document.querySelectorAll(".upi-app-btn");
        const qrImg = document.querySelector(".actual-qr-img");
        const qrText = document.querySelector(".qr-scan-text");

        if (qrImg) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=smartlibrary@upi%26am=${totalAmount}%26tn=LibraryPlan`;
        }

        upiApps.forEach(app => {
            app.addEventListener("click", function () {
                upiApps.forEach(a => {
                    a.style.border = "1px solid #e2e8f0";
                    a.style.background = "transparent";
                });

                this.style.border = "2px solid #007bff";
                this.style.background = "#f0f7ff";

                const appName = this.textContent.trim();

                if (appName.includes("Google Pay")) {
                    qrText.innerHTML = `Scan via <strong style="color:#4285F4;">Google Pay</strong> to pay <strong>₹${totalAmount}</strong>`;
                    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=smartlibrary.gpay@upi%26am=${totalAmount}%26pn=SmartLibrary`;
                } else if (appName.includes("PhonePe")) {
                    qrText.innerHTML = `Scan via <strong style="color:#5f259f;">PhonePe</strong> to pay <strong>₹${totalAmount}</strong>`;
                    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=smartlibrary.phonepe@upi%26am=${totalAmount}%26pn=SmartLibrary`;
                }
            });
        });

        const bankBtns = document.querySelectorAll(".bank-select-btn");
        const bankLoginWrapper = document.getElementById("bank-login-wrapper");
        const selectedBankNameEl = document.getElementById("selected-bank-name");

        bankBtns.forEach(btn => {
            btn.style.cursor = "pointer";
            btn.addEventListener("click", function () {
                bankBtns.forEach(b => {
                    b.style.borderColor = "#e2e8f0";
                    b.style.background = "transparent";
                });

                this.style.borderColor = "#007bff";
                this.style.background = "#f0f7ff";

                const bankId = this.getAttribute("data-bank");
                sessionStorage.setItem("selectedBank", bankId);

                if (bankLoginWrapper) {
                    bankLoginWrapper.style.display = "block";
                    bankLoginWrapper.style.opacity = "1";
                }
                if (selectedBankNameEl) {
                    selectedBankNameEl.textContent = bankId;
                }
            });
        });

        // Pay Button Action -> Call Backend API to Register and display User ID
        if (finalPayBtn) {
            finalPayBtn.addEventListener("click", function () {
                const activePanel = document.querySelector(".pay-panel.active");
                if (activePanel.id === "card-section") {
                    const inputs = activePanel.querySelectorAll("input");
                    let valid = true;
                    inputs.forEach(i => { if (!i.value) valid = false; });
                    if (!valid) {
                        alert("Please fill your card details before paying.");
                        return;
                    }
                } else if (activePanel.id === "net-section") {
                    const user = document.getElementById("bankUser").value;
                    const pass = document.getElementById("bankPass").value;
                    if (!user || !pass) {
                        alert("Please fill your bank login credentials.");
                        return;
                    }
                }

                const isUpgrade = sessionStorage.getItem("upgradeMode") === "true";

                if (isUpgrade) {
                    // Call Backend /api/user/upgrade — charges ONLY the new plan,
                    // keeps the same User ID and account.
                    finalPayBtn.setAttribute("disabled", "true");
                    finalPayBtn.innerHTML = `Processing Secure Payment... <i class="fa-solid fa-spinner fa-spin"></i>`;

                    const upgradeUserId = sessionStorage.getItem("upgradeUserId");
                    const upgradeData = {
                        userId: upgradeUserId,
                        plan: sessionStorage.getItem("mainPlan"),
                        duration: sessionStorage.getItem("duration"),
                        slot: sessionStorage.getItem("slot"),
                        selectedSeat: sessionStorage.getItem("selectedSeat"),
                        totalAmount: sessionStorage.getItem("totalAmount")
                    };

                    fetch('/api/user/upgrade', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(upgradeData)
                    })
                        .then(res => res.json())
                        .then(data => {
                            if (data.success) {
                                ["upgradeMode", "upgradeUserId", "mainPlan", "duration", "slot",
                                    "startSlotRaw", "planPrice", "gstAmount", "totalAmount", "selectedSeat"]
                                    .forEach(k => sessionStorage.removeItem(k));
                                showSuccessModal(data.user.userId, data.user.name, data.user.selectedSeat, { isUpgrade: true });
                            } else {
                                finalPayBtn.removeAttribute("disabled");
                                finalPayBtn.innerHTML = `Pay Amount ₹${totalAmount} <i class="fa-solid fa-lock"></i>`;
                                alert("Upgrade failed: " + data.message);
                            }
                        })
                        .catch(err => {
                            finalPayBtn.removeAttribute("disabled");
                            finalPayBtn.innerHTML = `Pay Amount ₹${totalAmount} <i class="fa-solid fa-lock"></i>`;
                            console.error("Upgrade error:", err);
                            alert("Error saving plan upgrade to database.");
                        });
                    return;
                }

                // Call Backend /api/register
                finalPayBtn.setAttribute("disabled", "true");
                finalPayBtn.innerHTML = `Processing Secure Payment... <i class="fa-solid fa-spinner fa-spin"></i>`;

                const regData = {
                    name: sessionStorage.getItem("studentName"),
                    phone: sessionStorage.getItem("mobileNo"),
                    email: sessionStorage.getItem("emailId"),
                    address: sessionStorage.getItem("address"),
                    idProofType: sessionStorage.getItem("idProofType"),
                    photoName: sessionStorage.getItem("photoName"),
                    photoPath: sessionStorage.getItem("photoPath"),
                    idName: sessionStorage.getItem("idName"),
                    idPath: sessionStorage.getItem("idPath"),
                    plan: sessionStorage.getItem("mainPlan"),
                    duration: sessionStorage.getItem("duration"),
                    slot: sessionStorage.getItem("slot"),
                    selectedSeat: sessionStorage.getItem("selectedSeat"),
                    totalAmount: sessionStorage.getItem("totalAmount")
                };

                fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(regData)
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        // Clear navigation sessions but save registration userId for feedback
                        sessionStorage.setItem("lastRegisteredUserId", data.userId);
                        sessionStorage.setItem("lastRegisteredUserName", data.user.name);
                        
                        showSuccessModal(data.userId, data.user.name, data.user.selectedSeat, { isUpgrade: false });
                    } else {
                        finalPayBtn.removeAttribute("disabled");
                        finalPayBtn.innerHTML = `Pay Amount ₹${totalAmount} <i class="fa-solid fa-lock"></i>`;
                        alert("Registration failed: " + data.message);
                    }
                })
                .catch(err => {
                    finalPayBtn.removeAttribute("disabled");
                    finalPayBtn.innerHTML = `Pay Amount ₹${totalAmount} <i class="fa-solid fa-lock"></i>`;
                    console.error("Booking error:", err);
                    alert("Error saving reservation to database.");
                });
            });
        }

        // Show premium success overlay modal
        function showSuccessModal(userId, name, seat, opts) {
            opts = opts || {};
            const isUpgrade = !!opts.isUpgrade;

            // Remove previous modals if exist
            const oldModal = document.getElementById("custom-success-modal");
            if (oldModal) oldModal.remove();

            const modalHtml = `
                <div id="custom-success-modal" style="
                    position: fixed;
                    top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(15, 23, 42, 0.7);
                    backdrop-filter: blur(8px);
                    display: flex; align-items: center; justify-content: center;
                    z-index: 10000;
                    animation: fadeIn 0.4s ease-out;
                ">
                    <div style="
                        background: #ffffff;
                        width: 90%; max-width: 480px;
                        border-radius: 20px;
                        padding: 35px 25px;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                        text-align: center;
                        border: 1px solid #e2e8f0;
                        position: relative;
                        transform: translateY(0);
                        animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    ">
                        <div style="
                            width: 72px; height: 72px;
                            background: #d1fae5; color: #10b981;
                            font-size: 32px; border-radius: 50%;
                            display: flex; align-items: center; justify-content: center;
                            margin: 0 auto 20px auto;
                            box-shadow: 0 8px 16px rgba(16, 185, 129, 0.15);
                        ">
                            <i class="fa-solid fa-circle-check"></i>
                        </div>
                        
                        <h2 style="font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">${isUpgrade ? "Plan Upgraded!" : "Booking Confirmed!"}</h2>
                        <p style="font-size: 14px; color: #64748b; margin-bottom: 24px;">Thank you ${name}. Your seat <strong>${seat}</strong> is secured successfully.</p>
                        
                        <div style="
                            background: #f1f5f9;
                            border: 1px dashed #cbd5e1;
                            border-radius: 12px;
                            padding: 16px;
                            margin-bottom: 25px;
                        ">
                            <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Your Unique Login User ID</span>
                            <div style="margin-top: 6px;">
                                <span style="
                                    font-size: 22px; font-weight: 800; color: #007cef;
                                    letter-spacing: 1px;
                                    font-family: monospace;
                                " id="glow-uid">${userId}</span>
                                <button type="button" class="copy-uid-btn" id="copy-uid-btn">
                                    <i class="fa-regular fa-copy"></i> Copy
                                </button>
                            </div>
                            <span style="font-size: 11px; color: #94a3b8; display: block; margin-top: 5px;">Save this ID to sign in to your dashboard.</span>
                            <span style="font-size: 11px; color: #059669; font-weight: 600; display: block; margin-top: 8px; line-height: 1.3;">
                                <i class="fa-solid fa-paper-plane" style="margin-right:4px;"></i> Your User ID & login link have been emailed to you.
                            </span>
                        </div>
                        
                        <button id="modal-signin-btn" style="
                            background: #007cef; color: #ffffff;
                            border: none; padding: 14px 28px;
                            font-size: 15px; font-weight: 600;
                            border-radius: 10px; cursor: pointer;
                            width: 100%; transition: all 0.2s;
                            box-shadow: 0 4px 12px rgba(0, 124, 239, 0.2);
                        ">
                            ${isUpgrade ? "Back to Dashboard" : "Proceed to Sign In"} <i class="fa-solid fa-arrow-right-to-bracket" style="margin-left:6px;"></i>
                        </button>
                    </div>
                    
                    <style>
                        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes slideUp { from { transform: translateY(20px); } to { transform: translateY(0); } }
                        #modal-signin-btn:hover { background: #0064c1; transform: translateY(-1px); }
                    </style>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            const proceed = () => {
                if (isUpgrade) {
                    // Already logged in — just return to the dashboard, keep the session.
                    window.location.href = "user-dashbord.html";
                } else {
                    sessionStorage.clear();
                    window.location.href = "login.html";
                }
            };

            document.getElementById("modal-signin-btn").addEventListener("click", proceed);

            // Copying the User ID automatically redirects to login shortly after,
            // since the person has confirmed they've saved their ID.
            const copyBtn = document.getElementById("copy-uid-btn");
            if (copyBtn) {
                copyBtn.addEventListener("click", () => {
                    const text = document.getElementById("glow-uid").textContent;
                    const finishCopyFeedback = () => {
                        copyBtn.classList.add("copied");
                        copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
                        setTimeout(proceed, 1200);
                    };
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(finishCopyFeedback).catch(finishCopyFeedback);
                    } else {
                        // Fallback for browsers without Clipboard API access
                        const tempInput = document.createElement("textarea");
                        tempInput.value = text;
                        document.body.appendChild(tempInput);
                        tempInput.select();
                        try { document.execCommand("copy"); } catch (err) { /* no-op */ }
                        document.body.removeChild(tempInput);
                        finishCopyFeedback();
                    }
                });
            }
        }
    }
});