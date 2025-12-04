// tester.js
// Handles the logic for rate limiting discovery

export class RateLimitTester {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.isRunning = false;
        this.basePrompt = "";
        this.variations = [];

        // Settings
        this.currentDelayMs = 12000; // Start conservative
        this.minDelayMs = 500;       // Aggressive floor

        // State
        this.successCount = 0;
        this.failCount = 0;
        this.timer = null;
        this.requestIndex = 0;
        this.consecutiveSuccess = 0;

        // Tuning
        this.backoffMultiplier = 2.0;
        this.speedupFactor = 0.75; 
    }

    async generateVariations(basePrompt) {
        try {
            // Ask LLM for variations to ensure we test "prompt variations"
            // and avoid identical prompt caching
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "Generate 10 distinct, creative visual descriptions based on the user's concept. Return ONLY a JSON array of strings."
                    },
                    {
                        role: "user",
                        content: `Concept: "${basePrompt}"`
                    }
                ],
                json: true
            });
            const result = JSON.parse(completion.content);
            if (Array.isArray(result)) return result;
            if (result.variations) return result.variations;
            return [basePrompt];
        } catch (e) {
            console.error("LLM Error:", e);
            return [basePrompt];
        }
    }

    async start(prompt, initialDelay = 12000) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.basePrompt = prompt;
        this.currentDelayMs = Math.max(100, Number(initialDelay));
        this.successCount = 0;
        this.failCount = 0;
        this.requestIndex = 0;
        this.consecutiveSuccess = 0;
        this.variations = [prompt];

        this.callbacks.onStart();
        this.callbacks.onLog("info", "Generating test variations...");

        try {
            const vars = await this.generateVariations(prompt);
            if (vars && vars.length) {
                this.variations = vars;
                this.callbacks.onLog("success", `Generated ${vars.length} variations.`);
            }
        } catch (e) {
            this.callbacks.onLog("warn", "Using raw prompt.");
        }

        if (!this.isRunning) return;

        this.callbacks.onLog("info", `Starting Sequence. Initial Interval: ${this.currentDelayMs}ms`);
        this.scheduleNextRequest(0);
    }

    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.callbacks.onStop();
        this.callbacks.onLog("warn", "Sequence Aborted.");
    }

    scheduleNextRequest(delay) {
        if (!this.isRunning) return;

        this.callbacks.onUpdateStats({
            delay: Math.round(this.currentDelayMs),
            success: this.successCount,
            fail: this.failCount
        });

        this.timer = setTimeout(() => {
            this.executeRequest();
        }, delay);
    }

    async executeRequest() {
        if (!this.isRunning) return;

        const reqId = this.requestIndex++;

        // Select prompt
        const baseText = this.variations[reqId % this.variations.length];
        // Append seed for definitive uniqueness
        const variation = `${baseText} --seed ${Math.floor(Math.random() * 1000000)}`;

        this.callbacks.onLog("info", `REQ #${reqId}: Initiating...`);
        this.callbacks.onImageStart(reqId);

        // Schedule next one immediately based on interval (Open Loop testing)
        // This tests the rate of initiation, not the duration of generation
        this.scheduleNextRequest(this.currentDelayMs);

        const startTime = Date.now();

        try {
            const result = await websim.imageGen({
                prompt: variation,
                width: 512,
                height: 512,
                aspect_ratio: "1:1"
            });

            if (!this.isRunning) return;
            const duration = Date.now() - startTime;
            this.handleSuccess(reqId, duration, result.url);

        } catch (error) {
            if (!this.isRunning) return;
            this.handleError(reqId, error);
        }
    }

    handleSuccess(id, duration, url) {
        this.successCount++;
        this.consecutiveSuccess++;
        this.callbacks.onLog("success", `REQ #${id}: OK (${(duration/1000).toFixed(1)}s)`);
        this.callbacks.onImageSuccess(id, url);

        // Accelerate if stable
        if (this.consecutiveSuccess >= 2) {
            this.currentDelayMs = Math.max(this.minDelayMs, this.currentDelayMs * this.speedupFactor);
            this.consecutiveSuccess = 0;
            this.callbacks.onLog("info", `Rate Up: Interval now ${Math.round(this.currentDelayMs)}ms`);
        }
    }

    handleError(id, error) {
        this.failCount++;
        this.consecutiveSuccess = 0;

        // Backoff
        this.currentDelayMs = Math.min(60000, this.currentDelayMs * this.backoffMultiplier);

        this.callbacks.onLog("error", `REQ #${id}: ERR - ${error.message || "Unknown"}`);
        this.callbacks.onLog("warn", `Rate Down: Interval now ${Math.round(this.currentDelayMs)}ms`);
        this.callbacks.onImageFail(id);
    }
}