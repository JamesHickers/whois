"use strict";

/*
 * WHOIS + Website Enhancer
 *
 * Combines:
 *   1. WHOIS search / profile analysis
 *   2. Local profile loading
 *   3. Modular OSINT analysis
 *   4. Fingerprinting / alias detection / graph rendering
 *   5. General article-site UI enhancements
 *
 * The WHOIS system remains independent from the general
 * article/portfolio functionality.
 */

// ============================================================
// WHOIS ENGINE
// ============================================================

const input = document.getElementById("inputSearch");
const btn = document.getElementById("searchBtn");
const result = document.getElementById("result");

const moduleCache = new Map();

const state = {
    keywordCache: Object.create(null),
    fingerprints: Object.create(null),
    confidence: Object.create(null),
    aliasCandidates: new Set(),
    graphNodes: [],
    graphLinks: []
};


// ============================================================
// MODULE LOADER
// ============================================================

async function importModule(file) {
    if (moduleCache.has(file)) {
        return moduleCache.get(file);
    }

    try {
        const mod = await import(`./modues/${file}`);
        moduleCache.set(file, mod);
        return mod;
    } catch (err) {
        console.error(
            `[WHOIS] Failed to import ./modues/${file}`,
            err
        );

        throw err;
    }
}


// ============================================================
// WHOIS STATE
// ============================================================

function resetState() {
    state.keywordCache = Object.create(null);
    state.fingerprints = Object.create(null);
    state.confidence = Object.create(null);
    state.aliasCandidates = new Set();
    state.graphNodes = [];
    state.graphLinks = [];
}


// ============================================================
// RESULTS SHELL
// ============================================================

function createResultsShell(user) {
    if (!result) {
        throw new Error(
            'WHOIS results container "#result" was not found.'
        );
    }

    result.replaceChildren();

    const heading = document.createElement("h2");
    heading.textContent = `Search Results for: ${user}`;

    const localProfile = document.createElement("div");
    localProfile.id = "localProfile";

    const dynamicProfile = document.createElement("div");
    dynamicProfile.id = "dynamicProfile";

    result.append(
        heading,
        localProfile,
        dynamicProfile
    );

    return {
        localProfile,
        dynamicProfile
    };
}


// ============================================================
// LOCAL PROFILE LOADER
// ============================================================

async function loadLocalProfile(user, container) {
    try {
        const response = await fetch(
            `individual/${encodeURIComponent(user)}.html`,
            {
                method: "GET",
                cache: "no-store"
            }
        );

        if (!response.ok) {
            if (response.status === 404) {
                container.textContent =
                    "No local profile was found for this identity.";
            } else {
                container.textContent =
                    `Local profile request failed: HTTP ${response.status}.`;
            }

            return false;
        }

        const html = await response.text();

        if (!html.trim()) {
            container.textContent =
                "The local profile exists but contains no content.";

            return false;
        }

        container.innerHTML = html;

        /*
         * Re-run website enhancements for dynamically loaded
         * profile content.
         */
        initializeDynamicContent(container);

        return true;

    } catch (err) {
        console.warn(
            "[WHOIS] Local profile load failed:",
            err
        );

        container.textContent =
            "Unable to load the local profile.";

        return false;
    }
}


// ============================================================
// WHOIS MODULE PIPELINE
// ============================================================

async function runModules(
    user,
    localProfile,
    dynamicProfile
) {
    const mod = await importModule("OIST.js");

    const keywords =
        state.keywordCache[user] ??= Object.create(null);


    // --------------------------------------------------------
    // Local profile analysis
    // --------------------------------------------------------

    if (localProfile?.textContent?.trim()) {
        mod.extractKeywords(
            localProfile.textContent,
            user,
            keywords
        );
    }


    // --------------------------------------------------------
    // GitHub analysis
    // --------------------------------------------------------

    await mod.fetchGitHubKeywords(
        user,
        keywords
    );


    // --------------------------------------------------------
    // Identity / alias analysis
    // --------------------------------------------------------

    mod.detectAliases(
        user,
        state.aliasCandidates
    );


    // --------------------------------------------------------
    // Fingerprint
    // --------------------------------------------------------

    mod.buildFingerprint(
        user,
        keywords,
        state
    );


    // --------------------------------------------------------
    // Observable content signals
    // --------------------------------------------------------

    mod.inferPersona(
        keywords,
        dynamicProfile
    );


    // --------------------------------------------------------
    // Fingerprint UI
    // --------------------------------------------------------

    mod.displayFingerprint(
        dynamicProfile,
        user,
        state
    );


    // --------------------------------------------------------
    // Graph
    // --------------------------------------------------------

    mod.buildGraph(
        user,
        state
    );

    mod.renderGraph(
        dynamicProfile,
        state
    );


    // --------------------------------------------------------
    // Debug information
    // --------------------------------------------------------

    const debug = document.createElement("section");

    const debugHeading = document.createElement("h3");
    debugHeading.textContent = "All Keywords";

    const pre = document.createElement("pre");
    pre.textContent =
        JSON.stringify(keywords, null, 2);

    debug.append(
        debugHeading,
        pre
    );

    dynamicProfile.appendChild(debug);
}


// ============================================================
// WHOIS SEARCH
// ============================================================

async function performSearch() {
    if (!input || !btn || !result) {
        console.warn(
            "[WHOIS] Search interface is not present on this page."
        );

        return;
    }

    const user = input.value.trim();

    if (!user) {
        return;
    }

    btn.disabled = true;

    resetState();

    const {
        localProfile,
        dynamicProfile
    } = createResultsShell(user);


    // --------------------------------------------------------
    // Loading status
    // --------------------------------------------------------

    const loading = document.createElement("p");

    loading.id = "searchStatus";
    loading.textContent = "Running analysis…";

    dynamicProfile.appendChild(loading);


    try {

        // Load local profile first.
        await loadLocalProfile(
            user,
            localProfile
        );


        // Run WHOIS analysis modules.
        await runModules(
            user,
            localProfile,
            dynamicProfile
        );


        loading.remove();


    } catch (err) {

        console.error(
            `[WHOIS] Analysis failed for "${user}":`,
            err
        );

        loading.remove();

        const errorSection =
            document.createElement("section");

        const heading =
            document.createElement("h3");

        heading.textContent =
            "Analysis Failed";

        const message =
            document.createElement("p");

        message.textContent =
            err instanceof Error
                ? err.message
                : String(err);

        errorSection.append(
            heading,
            message
        );

        dynamicProfile.prepend(
            errorSection
        );

    } finally {

        btn.disabled = false;
    }
}


// ============================================================
// WHOIS EVENT HANDLERS
// ============================================================

function initializeWhoisSearch() {
    if (!input || !btn) {
        return;
    }

    btn.addEventListener(
        "click",
        performSearch
    );

    input.addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                event.preventDefault();
                performSearch();
            }
        }
    );
}


// ============================================================
// GENERAL WEBSITE UTILITIES
// ============================================================

function debounce(func, wait = 150) {
    let timeout;

    return (...args) => {
        clearTimeout(timeout);

        timeout = setTimeout(
            () => func.apply(this, args),
            wait
        );
    };
}


function throttle(func, limit = 100) {
    let lastFunc;
    let lastRan;

    return (...args) => {

        if (!lastRan) {

            func.apply(this, args);
            lastRan = Date.now();

        } else {

            clearTimeout(lastFunc);

            lastFunc = setTimeout(() => {

                if (
                    Date.now() - lastRan >= limit
                ) {

                    func.apply(this, args);
                    lastRan = Date.now();
                }

            }, limit - (Date.now() - lastRan));
        }
    };
}


// ============================================================
// SECTION ENTRY ANIMATION
// ============================================================

function animateContentOnLoad(root = document) {
    const sections =
        root.querySelectorAll(
            ".article-section, .content-block, .section"
        );

    if (!sections.length) {
        return;
    }

    sections.forEach((el, i) => {

        el.style.opacity = "0";
        el.style.transform = "translateY(30px)";
        el.style.transition =
            "opacity 0.8s ease, transform 0.8s ease";

        setTimeout(() => {

            el.style.opacity = "1";
            el.style.transform = "translateY(0)";

        }, 200 + i * 100);
    });
}


// ============================================================
// LAZY LOAD IMAGES
// ============================================================

function lazyLoadImages(root = document) {
    const images =
        root.querySelectorAll("img[data-src]");

    if (!images.length) {
        return;
    }


    if ("IntersectionObserver" in window) {

        const observer =
            new IntersectionObserver(
                (entries, observerSelf) => {

                    entries.forEach(entry => {

                        if (!entry.isIntersecting) {
                            return;
                        }

                        const img = entry.target;

                        img.src = img.dataset.src;

                        img.removeAttribute("data-src");

                        observerSelf.unobserve(img);
                    });

                },
                {
                    rootMargin: "100px"
                }
            );


        images.forEach(img => {
            observer.observe(img);
        });

    } else {

        // Older-browser fallback.
        images.forEach(img => {

            img.src = img.dataset.src;

            img.removeAttribute("data-src");
        });
    }
}


// ============================================================
// TOC SCROLL SPY
// ============================================================

function tocScrollSpy() {
    const tocLinks =
        document.querySelectorAll(
            ".toc a[href^='#']"
        );

    if (!tocLinks.length) {
        return;
    }

    const sections =
        Array.from(tocLinks)
            .map(link =>
                document.querySelector(
                    link.getAttribute("href")
                )
            )
            .filter(Boolean);

    if (!sections.length) {
        return;
    }


    function highlightLink() {

        let current = sections[0];

        sections.forEach(section => {

            if (
                window.scrollY + 100 >=
                section.offsetTop
            ) {
                current = section;
            }
        });


        tocLinks.forEach(link => {
            link.classList.remove("active");
        });


        const activeLink =
            document.querySelector(
                `.toc a[href="#${CSS.escape(current.id)}"]`
            );

        if (activeLink) {
            activeLink.classList.add("active");
        }
    }


    window.addEventListener(
        "scroll",
        throttle(highlightLink, 100),
        { passive: true }
    );


    highlightLink();
}


// ============================================================
// SMOOTH SCROLLING
// ============================================================

function enableSmoothScrolling(root = document) {

    root.querySelectorAll(
        'a[href^="#"]'
    ).forEach(anchor => {

        const href =
            anchor.getAttribute("href");

        if (!href || href === "#") {
            return;
        }

        const target =
            document.querySelector(href);

        if (!target) {
            return;
        }


        anchor.addEventListener(
            "click",
            e => {

                e.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                history.pushState(
                    null,
                    "",
                    href
                );
            }
        );
    });
}


// ============================================================
// STICKY HEADER / TOC
// ============================================================

function stickyHeaderOrToc() {

    const stickyEl =
        document.querySelector(
            "header, .sticky-toc"
        );

    if (!stickyEl) {
        return;
    }

    const stickyClass =
        "is-sticky";


    window.addEventListener(
        "scroll",
        throttle(() => {

            if (window.scrollY > 100) {

                stickyEl.classList.add(
                    stickyClass
                );

            } else {

                stickyEl.classList.remove(
                    stickyClass
                );
            }

        }, 100),
        { passive: true }
    );
}


// ============================================================
// SCROLL POSITION RESTORATION
// ============================================================

function preserveScrollPosition() {

    const key = "scroll-pos";


    window.addEventListener(
        "beforeunload",
        () => {

            sessionStorage.setItem(
                key,
                String(window.scrollY)
            );
        }
    );


    const pos =
        sessionStorage.getItem(key);

    if (pos !== null) {

        const parsed =
            parseInt(pos, 10);

        if (!Number.isNaN(parsed)) {

            window.scrollTo(
                0,
                parsed
            );
        }

        sessionStorage.removeItem(key);
    }
}


// ============================================================
// RESPONSIVE EMBEDDED IFRAMES
// ============================================================

function autoResizeIframes() {

    const iframes =
        document.querySelectorAll(
            "iframe"
        );

    if (!iframes.length) {
        return;
    }


    window.addEventListener(
        "message",
        event => {

            /*
             * Only accept Carrd resize messages.
             */
            if (
                !event.origin.endsWith(
                    "carrd.co"
                )
            ) {
                return;
            }


            if (
                !event.data ||
                typeof event.data.height !== "number" ||
                !event.source
            ) {
                return;
            }


            iframes.forEach(iframe => {

                if (
                    iframe.contentWindow ===
                    event.source
                ) {

                    iframe.style.height =
                        `${event.data.height}px`;
                }
            });
        }
    );
}


// ============================================================
// READING PROGRESS BAR
// ============================================================

function readingProgress() {

    const progressBar =
        document.querySelector(
            ".progress-bar"
        );

    if (!progressBar) {
        return;
    }


    window.addEventListener(
        "scroll",
        throttle(() => {

            const scrollTop =
                window.scrollY;

            const docHeight =
                document.documentElement.scrollHeight -
                window.innerHeight;


            if (docHeight <= 0) {

                progressBar.style.width =
                    "0%";

                return;
            }


            const scrollPercent =
                (scrollTop / docHeight) * 100;


            progressBar.style.width =
                `${Math.min(
                    100,
                    Math.max(
                        0,
                        scrollPercent
                    )
                )}%`;

        }, 50),
        { passive: true }
    );
}


// ============================================================
// TOGGLE VISIBILITY
// ============================================================

function toggleVisibility(id) {

    const el =
        document.getElementById(id);

    if (!el) {
        return;
    }

    el.classList.toggle(
        "hidden-section"
    );
}


// ============================================================
// DYNAMIC CONTENT INITIALIZATION
// ============================================================

function initializeDynamicContent(root) {

    if (!root) {
        return;
    }

    animateContentOnLoad(root);
    lazyLoadImages(root);
    enableSmoothScrolling(root);
}


// ============================================================
// GLOBAL WEBSITE INITIALIZATION
// ============================================================

function initializeWebsite() {

    animateContentOnLoad();

    lazyLoadImages();

    tocScrollSpy();

    enableSmoothScrolling();

    stickyHeaderOrToc();

    preserveScrollPosition();

    autoResizeIframes();

    readingProgress();

    initializeWhoisSearch();
}


// ============================================================
// DOM READY
// ============================================================

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializeWebsite,
        {
            once: true
        }
    );

} else {

    initializeWebsite();
}
