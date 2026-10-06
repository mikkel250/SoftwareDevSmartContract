let provider, signer;
let isWalletConnected = false; // Track wallet connection state locally

function checkEthersLoaded() {
    console.log('=== Ethers.js Loading Check ===');
    console.log('typeof ethers:', typeof ethers);
    if (typeof ethers !== 'undefined') {
        console.log('ethers version:', ethers.version);
        console.log('ethers providers:', Object.keys(ethers.providers || {}));
        return true;
    } else {
        console.error('ethers is not defined!');
        return false;
    }
}

function checkWalletStatus() {
    console.log('=== Wallet Detection Debug ===');
    console.log('window.ethereum exists:', typeof window.ethereum !== 'undefined');
    console.log('User agent:', navigator.userAgent);
    
    const isBrave = navigator.brave && navigator.brave.isBrave;
    console.log('Brave browser detected:', isBrave);
    
    if (typeof window.ethereum !== 'undefined') {
        console.log('MetaMask detected:', window.ethereum.isMetaMask);
        console.log('Provider details:', window.ethereum);
        console.log('Selected address:', window.ethereum.selectedAddress);
        console.log('Provider list:', window.ethereum.providers ? window.ethereum.providers.length : 'No providers array');
        
        // Check for multiple providers (common in Brave)
        if (window.ethereum.providers && window.ethereum.providers.length > 0) {
            console.log('Multiple providers detected:');
            window.ethereum.providers.forEach((provider, index) => {
                console.log(`Provider ${index}:`, {
                    isMetaMask: provider.isMetaMask,
                    isBraveWallet: provider.isBraveWallet,
                    selectedAddress: provider.selectedAddress
                });
            });
        }
        
        return { 
            available: true, 
            provider: window.ethereum,
            isMetaMask: window.ethereum.isMetaMask,
            isBrave: isBrave,
            hasMultipleProviders: window.ethereum.providers && window.ethereum.providers.length > 0,
            connected: window.ethereum.selectedAddress !== null
        };
    }
    
    console.log('No Ethereum provider found');
    return { available: false, reason: 'No wallet provider found', isBrave: isBrave };
}

async function handleWalletAction() {
    console.log('=== handleWalletAction called ===');
    console.log('isWalletConnected:', isWalletConnected);
    console.log('window.ethereum.selectedAddress:', window.ethereum?.selectedAddress);
    console.log('provider:', provider);
    console.log('signer:', signer);
    
    if (isWalletConnected) {
        // Wallet is connected, show disconnect confirmation
        console.log('Wallet is connected, showing disconnect confirmation');
        if (confirm('Are you sure you want to disconnect your wallet?')) {
            console.log('User confirmed disconnect, calling disconnectWallet');
            await disconnectWallet();
            console.log('disconnectWallet completed');
        } else {
            console.log('User cancelled disconnect');
        }
    } else {
        // Wallet is not connected, connect it
        console.log('Wallet is not connected, calling connectWallet');
        connectWallet();
    }
}

async function connectWallet() {
    console.log('=== Starting Wallet Connection ===');
    
    // Show loading state
    const connectBtn = document.getElementById('walletButton');
    if (connectBtn) {
        connectBtn.textContent = 'Connecting...';
        connectBtn.disabled = true;
    }

    try {
        console.log('Checking wallet status...');
        const walletStatus = checkWalletStatus();
        
        if (!walletStatus.available) {
            let message = 'Please install MetaMask or another Web3 wallet to continue. ' +
                '<a href="https://metamask.io/download/" target="_blank" style="color: #007bff;">Download MetaMask</a>';
            
            if (walletStatus.isBrave) {
                message = '<strong>Brave Browser Detected!</strong><br><br>' +
                    'Brave has a built-in wallet that may conflict with MetaMask. To use MetaMask:<br><br>' +
                    '1. Go to <code>brave://settings/web3</code><br>' +
                    '2. Set "Default Ethereum wallet" to <strong>"Extensions"</strong> or <strong>"None"</strong><br>' +
                    '3. Restart Brave browser<br>' +
                    '4. Try connecting again<br><br>' +
                    '<a href="https://metamask.io/download/" target="_blank" style="color: #007bff;">Install MetaMask</a>';
            }
            
            showResult('walletStatus', message, 'error');
            return;
        }

        // Check for Brave wallet conflicts
        if (walletStatus.isBrave && walletStatus.hasMultipleProviders) {
            console.log('Brave with multiple providers detected, attempting to use MetaMask...');
            
            // Try to find MetaMask provider
            const metaMaskProvider = window.ethereum.providers?.find(provider => provider.isMetaMask);
            if (metaMaskProvider) {
                console.log('Using MetaMask provider specifically');
                window.ethereum = metaMaskProvider;
            }
        } else if (walletStatus.isBrave && !window.ethereum.isMetaMask) {
            showResult('walletStatus', 
                ' <strong>Brave Wallet Detected!</strong><br><br>' +
                'It looks like Brave Wallet is the default. To use MetaMask instead:<br><br>' +
                '1. Go to <code>brave://settings/web3</code><br>' +
                '2. Set "Default Ethereum wallet" to <strong>"Extensions"</strong><br>' +
                '3. Restart Brave and try again<br><br>' +
                'Or continue with Brave Wallet (experimental)', 
                'error');
            return;
        }

        console.log('Requesting account access...');
        showResult('walletConnectionStatus', 'Requesting wallet connection...', 'info');

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        console.log('Accounts received:', accounts);

        if (accounts.length === 0) {
            throw new Error('No accounts returned from wallet');
        }

        console.log('Creating provider and signer...');
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        const address = await signer.getAddress();
        const network = await provider.getNetwork();
        
        console.log('Connected address:', address);
        console.log('Connected network:', network);
        
        console.log('Updating DOM elements...');
        const walletStatusElement = document.getElementById('walletStatus');
        const walletAddressElement = document.getElementById('walletAddress');
        
        console.log('DOM elements found:', {
            walletStatus: !!walletStatusElement,
            walletAddress: !!walletAddressElement,
            walletStatusId: walletStatusElement?.id,
            walletAddressId: walletAddressElement?.id
        });
        
        if (!walletStatusElement || !walletAddressElement) {
            console.error('DOM elements missing:', {
                walletStatus: walletStatusElement,
                walletAddress: walletAddressElement
            });
            throw new Error('Required DOM elements not found');
        }
        
        console.log('Updating wallet status display...');
        walletStatusElement.style.display = 'block';
        walletStatusElement.className = 'status success';
        walletAddressElement.textContent = address;
        
        console.log('Adding network info...');
        // Add network info below the address
        const networkInfo = document.createElement('div');
        networkInfo.style.fontSize = '0.9em';
        networkInfo.style.marginTop = '5px';
        networkInfo.textContent = `Network: ${network.name} (${network.chainId})`;
        
        // Clear any existing network info and add the new one
        const existingNetworkInfo = walletStatusElement.querySelector('.network-info');
        if (existingNetworkInfo) {
            existingNetworkInfo.remove();
        }
        networkInfo.className = 'network-info';
        walletStatusElement.appendChild(networkInfo);

        console.log('Updating button text and state...');
        // Update button text and local state
        if (connectBtn) {
            connectBtn.textContent = 'Disconnect Wallet';
        }
        isWalletConnected = true;
        
        console.log('=== Wallet Connection Successful ===');
        console.log('isWalletConnected after connect:', isWalletConnected);
        
        // Clear the connection status message
        const connectionStatus = document.getElementById('walletConnectionStatus');
        if (connectionStatus) {
            connectionStatus.style.display = 'none';
        }

        await onWalletReady();
    } catch (error) {
        console.error('Wallet connection error:', error);
        
        let errorMessage = 'Error connecting wallet: ';
        if (error.code === 4001) {
            errorMessage += 'Connection request was rejected by user';
        } else if (error.code === -32002) {
            errorMessage += 'Connection request is already pending. Please check your wallet.';
        } else if (error.message.includes('Required DOM elements not found')) {
            errorMessage += 'Page structure error - please refresh the page and try again';
        } else {
            errorMessage += escapeHtml(error.message);
        }
        
        showResult('walletConnectionStatus', errorMessage, 'error');
    } finally {
        if (connectBtn) {
            connectBtn.textContent = isWalletConnected ? 'Disconnect Wallet' : 'Connect Wallet';
            connectBtn.disabled = false;
        }
    }
}

function clearWalletSession() {
    provider = null;
    signer = null;
    isWalletConnected = false;
    onWalletCleared();

    const walletStatus = document.getElementById('walletStatus');
    const walletAddress = document.getElementById('walletAddress');
    const connectBtn = document.getElementById('walletButton');

    if (walletStatus) {
        walletStatus.style.display = 'none';
        const networkInfo = walletStatus.querySelector('.network-info');
        if (networkInfo) {
            networkInfo.remove();
        }
    }
    if (walletAddress) {
        walletAddress.textContent = '';
    }
    if (connectBtn) {
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.disabled = false;
    }

    ['walletConnectionStatus'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
        }
    });
}

async function disconnectWallet() {
    console.log('=== Disconnecting Wallet ===');

    if (!isWalletConnected && !provider && !signer) {
        console.log('No active connection to disconnect');
        return;
    }

    getMetaMaskStatus();
    const connectBtn = document.getElementById('walletButton');
    if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Disconnecting...';
    }

    try {
        if (typeof window.ethereum !== 'undefined' && window.ethereum.request) {
            try {
                await window.ethereum.request({
                    method: 'wallet_revokePermissions',
                    params: [{ eth_accounts: {} }]
                });
                console.log('Successfully revoked wallet permissions');
            } catch (e) {
                console.log('wallet_revokePermissions not supported or failed:', e.message);
                try {
                    if (window.ethereum.disconnect && typeof window.ethereum.disconnect === 'function') {
                        await window.ethereum.disconnect();
                        console.log('Successfully disconnected using disconnect method');
                    }
                } catch (e2) {
                    console.log('disconnect method not supported or failed:', e2.message);
                }
            }
        }
    } finally {
        clearWalletSession();
        console.log('=== Wallet Disconnected ===');
        showResult('walletConnectionStatus', 'Wallet disconnected successfully!', 'success');
    }
}

async function checkExistingConnection() {
    console.log('=== Checking Existing Connection ===');
    
    // Get current MetaMask status
    const metaMaskStatus = getMetaMaskStatus();
    
    const walletStatus = checkWalletStatus();
    if (!walletStatus.available) {
        console.log('No wallet available');
        return false;
    }

    if (walletStatus.connected) {
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            const address = await signer.getAddress();
            const network = await provider.getNetwork();
            
            console.log('Existing connection found:', address);
            
            const walletStatusElement = document.getElementById('walletStatus');
            const walletAddressElement = document.getElementById('walletAddress');
            
            if (!walletStatusElement || !walletAddressElement) {
                console.log('Required DOM elements not found in checkExistingConnection');
                return false;
            }
            
            walletStatusElement.style.display = 'block';
            walletStatusElement.className = 'status success';
            walletAddressElement.textContent = address;
            
            // Add network info below the address
            const networkInfo = document.createElement('div');
            networkInfo.style.fontSize = '0.9em';
            networkInfo.style.marginTop = '5px';
            networkInfo.textContent = `Network: ${network.name} (${network.chainId})`;
            
            // Clear any existing network info and add the new one
            const existingNetworkInfo = walletStatusElement.querySelector('.network-info');
            if (existingNetworkInfo) {
                existingNetworkInfo.remove();
            }
            networkInfo.className = 'network-info';
            walletStatusElement.appendChild(networkInfo);
            
            const connectBtn = document.getElementById('walletButton');
            if (connectBtn) {
                connectBtn.textContent = 'Disconnect Wallet';
            }
            
            isWalletConnected = true;
            await onWalletReady();
            return true;
        } catch (error) {
            console.log('Failed to restore existing connection:', error);
            // Reset state on error
            isWalletConnected = false;
            provider = null;
            signer = null;
            return false;
        }
    }
    
    return false;
}

async function resolveENS() {
    try {
        const ensName = document.getElementById('ensInput').value;
        if (!ensName) {
            showResult('ensResult', 'Please enter an ENS name', 'error');
            return;
        }

        const address = await provider.resolveName(ensName);
        if (address) {
            const reverseName = await provider.lookupAddress(address);
            const result = `${escapeHtml(ensName)} → ${escapeHtml(address)}<br>Reverse: ${escapeHtml(address)} → ${escapeHtml(reverseName || 'No ENS name')}`;
            showResult('ensResult', result, 'success');
        } else {
            showResult('ensResult', `${escapeHtml(ensName)} not found`, 'error');
        }
    } catch (error) {
        showResult('ensResult', 'Error resolving ENS: ' + escapeHtml(error.message), 'error');
    }
}

async function getBlockchainInfo() {
    try {
        const blockNumber = await provider.getBlockNumber();
        const network = await provider.getNetwork();
        const gasPrice = await provider.getGasPrice();
        const balance = await signer.getBalance();

        const info = `
            <strong>Blockchain Information:</strong><br>
            Current Block: ${escapeHtml(blockNumber)}<br>
            Network: ${escapeHtml(network.name)} (Chain ID: ${escapeHtml(network.chainId)})<br>
            Gas Price: ${escapeHtml(ethers.utils.formatUnits(gasPrice, 'gwei'))} Gwei<br>
            Your Balance: ${escapeHtml(ethers.utils.formatEther(balance))} ETH
        `;
        showResult('blockchainInfo', info, 'info');
    } catch (error) {
        showResult('blockchainInfo', 'Error getting blockchain info: ' + escapeHtml(error.message), 'error');
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showResult(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.innerHTML = message;
    element.className = 'status ' + type;
    element.style.display = 'block';
}

function testDOMAccess() {
    console.log('=== Testing DOM Access ===');
    const elements = {
        walletStatus: document.getElementById('walletStatus'),
        walletAddress: document.getElementById('walletAddress'),
        walletButton: document.getElementById('walletButton')
    };
    
    console.log('DOM elements test:', {
        walletStatus: {
            found: !!elements.walletStatus,
            id: elements.walletStatus?.id,
            tagName: elements.walletStatus?.tagName,
            className: elements.walletStatus?.className
        },
        walletAddress: {
            found: !!elements.walletAddress,
            id: elements.walletAddress?.id,
            tagName: elements.walletAddress?.tagName,
            className: elements.walletAddress?.className
        },
        walletButton: {
            found: !!elements.walletButton,
            id: elements.walletButton?.id,
            tagName: elements.walletButton?.tagName,
            textContent: elements.walletButton?.textContent
        }
    });
    
    return elements.walletStatus && elements.walletAddress && elements.walletButton;
}

function getMetaMaskStatus() {
    console.log('=== MetaMask Status Check ===');
    const isBrave = navigator.brave && navigator.brave.isBrave;
    
    const status = {
        ethereumExists: typeof window.ethereum !== 'undefined',
        selectedAddress: window.ethereum?.selectedAddress,
        isConnected: window.ethereum?.selectedAddress !== null && window.ethereum?.selectedAddress !== undefined,
        isMetaMask: window.ethereum?.isMetaMask,
        chainId: window.ethereum?.chainId,
        networkVersion: window.ethereum?.networkVersion,
        isBrave: isBrave,
        hasMultipleProviders: window.ethereum?.providers && window.ethereum.providers.length > 0,
        localState: {
            isWalletConnected,
            hasProvider: !!provider,
            hasSigner: !!signer
        }
    };
    
    console.log('MetaMask Status:', status);
    return status;
}

// Handle wallet events
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        console.log('Accounts changed:', accounts);
        if (accounts.length === 0) {
            // User disconnected wallet
            console.log('Wallet disconnected via accountsChanged event');
            document.getElementById('walletStatus').style.display = 'none';
            const connectBtn = document.getElementById('walletButton');
            if (connectBtn) {
                connectBtn.textContent = 'Connect Wallet';
            }
            isWalletConnected = false;
            provider = null;
            signer = null;
            onWalletCleared();
        } else {
            // Account switched, reconnect
            console.log('Account switched, reconnecting...');
            checkExistingConnection();
        }
    });

    window.ethereum.on('chainChanged', (chainId) => {
        console.log('Chain changed:', chainId);
        // Reload the page to reset the dApp state
        window.location.reload();
    });
    
    // Handle disconnect event (MetaMask v10+)
    if (window.ethereum.on && typeof window.ethereum.on === 'function') {
        try {
            window.ethereum.on('disconnect', (error) => {
                console.log('MetaMask disconnect event:', error);
                // Reset local state when MetaMask disconnects
                isWalletConnected = false;
                provider = null;
                signer = null;
                onWalletCleared();
                
                // Update UI
                const walletStatus = document.getElementById('walletStatus');
                const connectBtn = document.getElementById('walletButton');
                
                if (walletStatus) {
                    walletStatus.style.display = 'none';
                }
                if (connectBtn) {
                    connectBtn.textContent = 'Connect Wallet';
                }
            });
        } catch (e) {
            console.log('disconnect event not supported:', e.message);
        }
    }
}

// Auto-check existing connection on page load
window.addEventListener('load', async () => {
    console.log('=== Page Loaded - Checking Wallet Status ===');
    
    // Add a small delay to ensure MetaMask is fully loaded
    setTimeout(async () => {
        // First check if DOM elements are available
        const walletStatus = document.getElementById('walletStatus');
        const walletAddress = document.getElementById('walletAddress');
        const walletButton = document.getElementById('walletButton');
        
        console.log('DOM elements check on load:', {
            walletStatus: !!walletStatus,
            walletAddress: !!walletAddress,
            walletButton: !!walletButton
        });
        
        if (!walletStatus || !walletAddress || !walletButton) {
            console.error('Critical DOM elements missing on page load');
            return;
        }
        
        // Test DOM access
        if (!testDOMAccess()) {
            console.error('DOM access test failed');
            return;
        }
        
        // Check MetaMask status
        const metaMaskStatus = getMetaMaskStatus();
        console.log('MetaMask status on page load:', metaMaskStatus);
        
        // If MetaMask is connected, restore the connection
        if (metaMaskStatus.isConnected) {
            console.log('MetaMask is connected, restoring connection...');
            const isConnected = await checkExistingConnection();
            if (isConnected) {
                console.log('Successfully restored existing connection');
                return;
            }
        }
        
        // If no existing connection found
        console.log('No existing connection found');
        onWalletCleared();
        
        // Show helpful message if no wallet detected
        if (!metaMaskStatus.ethereumExists) {
            let message = 'To use this dApp, please install MetaMask or another Web3 wallet first.';
            
            if (metaMaskStatus.isBrave) {
                message = ' <strong>Brave Browser Detected!</strong><br><br>' +
                    'For the best experience with this dApp:<br><br>' +
                    '1. Install MetaMask extension<br>' +
                    '2. Go to <code>brave://settings/web3</code><br>' +
                    '3. Set "Default Ethereum wallet" to <strong>"Extensions"</strong><br>' +
                    '4. Restart Brave and return to this page<br><br>' +
                    '<a href="https://metamask.io/download/" target="_blank" style="color: #007bff;">Install MetaMask</a>';
            }
            
            showResult('walletConnectionStatus', message, 'info');
        } else if (!metaMaskStatus.isConnected) {
            // MetaMask exists but not connected
            showResult('walletConnectionStatus', 'MetaMask detected. Click "Connect Wallet" to connect.', 'info');
        }
    }, 100);
});

// ---------------------------------------------------------------------------
// Milestone payments
// ---------------------------------------------------------------------------

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const PROJECT_STATUS = ['Setup', 'Active', 'Stopped', 'Completed'];
const MILESTONE_STATUS = ['Unfunded', 'Funded', 'Delivered', 'Paid', 'Returned'];
const PAGE_SIZE = 10;
const MAX_MILESTONES = 50;
const MAX_REVIEW_DAYS = 365;
const DEFAULT_REVIEW_DAYS = '7';

const ERROR_ABI = [
    "error NotClient()",
    "error NotDeveloper()",
    "error NotParty()",
    "error InvalidDeveloper()",
    "error InvalidClient()",
    "error InvalidMilestoneCount()",
    "error LengthMismatch()",
    "error InvalidAmount()",
    "error InvalidWindow()",
    "error UnknownMilestone()",
    "error WrongProjectStatus()",
    "error WrongMilestoneStatus()",
    "error PreviousNotPaid()",
    "error TermsChanged()",
    "error TermsNotConfirmed()",
    "error StaleVersion()",
    "error WrongValue()",
    "error ReviewClosed()",
    "error ReviewOpen()",
    "error IncompleteReceipt()",
    "error NothingOwed()",
    "error WithdrawFailed()",
    "error AssetNotAllowed()",
    "error ReentrancyGuardReentrantCall()"
];

const FACTORY_ABI = [
    "function createProject(address client, address asset, uint256 deposit, uint256[] amounts, uint256[] reviewWindows) returns (address)",
    "function isProject(address) view returns (bool)",
    "function projectCount(address account) view returns (uint256)",
    "function projectsOf(address account, uint256 offset, uint256 limit) view returns (address[])",
    "event ProjectCreated(address indexed project, address indexed developer, address indexed client, address asset)",
    ...ERROR_ABI
];

const PROJECT_ABI = [
    "function getSummary() view returns (tuple(address factory, address developer, address client, address asset, uint256 deposit, uint8 status, uint256 milestoneCount, uint256 currentMilestone, uint256 termsVersion, uint256 confirmedVersion))",
    "function getMilestones() view returns (tuple(uint256 amount, uint64 reviewWindow, uint64 deliveredAt, uint8 status)[])",
    "function owed(address) view returns (uint256)",
    "function editDeposit(uint256 newDeposit)",
    "function editMilestone(uint256 index, uint256 amount, uint256 reviewWindow)",
    "function confirmTerms(uint256 version)",
    "function startLock(uint256 expectedDeposit, uint256 expectedAmount, uint256 expectedWindow) payable",
    "function fundMilestone(uint256 index, uint256 expectedAmount, uint256 expectedWindow) payable",
    "function markDelivered(uint256 index)",
    "function accept(uint256 index)",
    "function reject(uint256 index)",
    "function release(uint256 index)",
    "function withdraw()",
    "event DepositEdited(address indexed by, uint256 deposit, uint256 termsVersion)",
    "event MilestoneEdited(uint256 indexed index, address indexed by, uint256 amount, uint256 reviewWindow, uint256 termsVersion)",
    ...ERROR_ABI
];

// approve is declared without a return value so USDT, which returns nothing, works too.
const ERC20_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount)"
];

const ERROR_MESSAGES = {
    NotClient: 'Only the client can do this.',
    NotDeveloper: 'Only the developer can do this.',
    NotParty: 'Only the developer or the client can edit the terms.',
    InvalidClient: 'The client must be a non-zero address different from your own.',
    InvalidMilestoneCount: `A project needs 1 to ${MAX_MILESTONES} milestones.`,
    LengthMismatch: 'Every milestone needs an amount and a review window.',
    InvalidAmount: 'The deposit and every milestone amount must be above zero.',
    InvalidWindow: `Every review window must be above zero and at most ${MAX_REVIEW_DAYS} days.`,
    WrongProjectStatus: 'The project is not in a state that allows this.',
    WrongMilestoneStatus: 'The milestone is not in a state that allows this.',
    PreviousNotPaid: 'The previous milestone must be paid before this one can be funded.',
    TermsChanged: 'The amounts or review window changed since you loaded them. The page has refreshed the current values; review them and try again.',
    TermsNotConfirmed: 'Waiting for the developer to confirm the latest changes.',
    StaleVersion: 'The terms changed again before you confirmed. Review the refreshed values and confirm again.',
    WrongValue: 'The amount sent does not match the locked amount.',
    ReviewClosed: 'The review window has ended. The milestone can only be released to the developer now.',
    ReviewOpen: 'The review window is still open.',
    IncompleteReceipt: 'The token delivered less than the full amount (a transfer fee is active), so nothing was locked. Use another stablecoin for a new project.',
    NothingOwed: 'You have no credit to withdraw.',
    WithdrawFailed: 'The withdrawal transfer failed. Check that your address can receive it and try again.',
    AssetNotAllowed: 'That asset is not on this factory\'s allowlist.'
};

let deployments = null;
let networkEntry = null;
let factory = null;
let account = null;
let projectList = { total: 0, loaded: 0 };
let currentProject = null;
let createDraft = null;
let chainClockOffset = 0;
let countdownTimer = null;
let errorInterface = null;

function setupMilestoneUi() {
    document.getElementById('projectList').addEventListener('click', (event) => {
        const row = event.target.closest('[data-open-project]');
        if (row) {
            document.getElementById('projectAddressInput').value = row.dataset.openProject;
            openProject(row.dataset.openProject);
        }
    });
    document.getElementById('projectView').addEventListener('click', onProjectViewClick);
    document.getElementById('projectView').addEventListener('change', (event) => {
        if (event.target.id === 'confirmDeveloper') {
            updateStartLockButton();
        }
    });
    document.getElementById('milestoneRows').addEventListener('input', updateSplitHint);
    ['assetSelect', 'workTotalInput', 'milestoneCountInput'].forEach((id) => {
        document.getElementById(id).addEventListener('input', clearSplit);
    });
    document.getElementById('assetSelect').addEventListener('change', clearSplit);
}

document.addEventListener('DOMContentLoaded', setupMilestoneUi);

// --- Helpers ---------------------------------------------------------------

function toBig(value) {
    return BigInt(value.toString());
}

function sameAddress(a, b) {
    return Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
}

function findAsset(address) {
    return (networkEntry?.assets || []).find((asset) => sameAddress(asset.address, address)) || null;
}

function formatAmount(value, asset) {
    return `${MilestoneMath.formatUnits(value, asset.decimals)} ${asset.symbol}`;
}

function formatDuration(totalSeconds) {
    let seconds = Math.max(0, Math.floor(totalSeconds));
    const parts = [];
    const units = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
    for (const [name, size] of units) {
        const count = Math.floor(seconds / size);
        seconds -= count * size;
        if (count > 0) {
            parts.push(`${count} ${name}${count === 1 ? '' : 's'}`);
        }
    }
    return parts.length ? parts.slice(0, 2).join(' ') : '0 seconds';
}

function daysToSeconds(text) {
    const trimmed = String(text).trim();
    if (!/^\d*\.?\d+$/.test(trimmed)) {
        throw new Error('Review window must be a positive number of days');
    }
    const seconds = Math.round(Number(trimmed) * 86400);
    if (seconds <= 0 || seconds > MAX_REVIEW_DAYS * 86400) {
        throw new Error(`Review window must be above zero and at most ${MAX_REVIEW_DAYS} days`);
    }
    return seconds;
}

function secondsToDays(seconds) {
    return String(Number((seconds / 86400).toFixed(6)));
}

function localTime(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

function chainNow() {
    return Math.floor(Date.now() / 1000 + chainClockOffset);
}

async function syncChainClock() {
    const block = await provider.getBlock('latest');
    chainClockOffset = Math.max(0, block.timestamp - Date.now() / 1000);
}

async function lookupName(address) {
    try {
        return await provider.lookupAddress(address);
    } catch (error) {
        return null;
    }
}

function nameSuffix(name) {
    return name ? ` (${escapeHtml(name)})` : ' (no ENS name)';
}

function decodeRevert(error) {
    if (!errorInterface) {
        errorInterface = new ethers.utils.Interface(ERROR_ABI);
    }
    const seen = new Set();
    const stack = [error];
    while (stack.length) {
        const item = stack.pop();
        if (!item || typeof item !== 'object' || seen.has(item)) {
            continue;
        }
        seen.add(item);
        for (const value of Object.values(item)) {
            if (typeof value === 'string' && /^0x[0-9a-fA-F]{8}/.test(value)) {
                try {
                    return errorInterface.parseError(value).name;
                } catch (e) {
                    // Not a known custom error; keep searching.
                }
            } else if (typeof value === 'string' && value.startsWith('{')) {
                try {
                    stack.push(JSON.parse(value));
                } catch (e) {
                    // Not JSON.
                }
            } else if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }
    return null;
}

function describeError(error) {
    if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
        return 'You rejected the request in your wallet.';
    }
    const name = decodeRevert(error);
    if (name) {
        return ERROR_MESSAGES[name] || `The contract rejected the call (${name}).`;
    }
    return error?.reason || error?.message || String(error);
}

// --- Wallet and network -----------------------------------------------------

async function loadDeployments() {
    if (!deployments) {
        const response = await fetch('deployments.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`deployments.json returned HTTP ${response.status}`);
        }
        deployments = await response.json();
    }
    return deployments;
}

async function onWalletReady() {
    try {
        account = await signer.getAddress();
        const network = await provider.getNetwork();
        await loadDeployments();
        networkEntry = deployments[String(network.chainId)] || null;
        if (!networkEntry || !networkEntry.factory) {
            factory = null;
            setProjectSectionsEnabled(false);
            showResult('networkStatus', `Unsupported network: chain ${escapeHtml(network.chainId)} has no milestone factory. Switch your wallet to a supported network.`, 'error');
            renderProjectsMessage('Unsupported network. No projects can be shown.');
            clearProjectView();
            return;
        }
        factory = new ethers.Contract(networkEntry.factory, FACTORY_ABI, signer);
        await syncChainClock();
        setProjectSectionsEnabled(true);
        showResult('networkStatus', `Milestone factory <span class="address">${escapeHtml(networkEntry.factory)}</span> on ${escapeHtml(networkEntry.name)} (chain ${escapeHtml(network.chainId)}).`, 'info');
        populateAssetSelect();
        await refreshProjects();
        if (currentProject) {
            await openProject(currentProject.address);
        }
    } catch (error) {
        factory = null;
        setProjectSectionsEnabled(false);
        showResult('networkStatus', 'Could not load the milestone app: ' + escapeHtml(error.message), 'error');
    }
}

function onWalletCleared() {
    account = null;
    factory = null;
    networkEntry = null;
    currentProject = null;
    setProjectSectionsEnabled(false);
    const status = document.getElementById('networkStatus');
    if (status) {
        status.style.display = 'none';
    }
    renderProjectsMessage('Connect your wallet to see your projects.');
    clearProjectView();
}

function setProjectSectionsEnabled(enabled) {
    document.querySelectorAll('.needs-factory input, .needs-factory select, .needs-factory button').forEach((element) => {
        element.disabled = !enabled;
    });
    document.getElementById('createProjectBtn').disabled = !enabled || !createDraft;
}

function populateAssetSelect() {
    const select = document.getElementById('assetSelect');
    const previous = select.value;
    select.innerHTML = networkEntry.assets
        .map((asset) => `<option value="${escapeHtml(asset.address)}">${escapeHtml(asset.symbol)} (${escapeHtml(asset.decimals)} decimals)</option>`)
        .join('');
    if (networkEntry.assets.some((asset) => asset.address === previous)) {
        select.value = previous;
    }
}

// --- My projects ------------------------------------------------------------

function renderProjectsMessage(message) {
    const list = document.getElementById('projectList');
    if (!list) {
        return;
    }
    list.innerHTML = `<li class="muted">${escapeHtml(message)}</li>`;
    document.getElementById('loadMoreProjects').style.display = 'none';
}

async function refreshProjects() {
    if (!factory || !account) {
        return;
    }
    try {
        projectList = { total: Number(await factory.projectCount(account)), loaded: 0 };
        document.getElementById('projectList').innerHTML = '';
        if (projectList.total === 0) {
            renderProjectsMessage('No projects for this account');
            return;
        }
        await loadMoreProjects();
    } catch (error) {
        renderProjectsMessage('Could not load projects: ' + describeError(error));
    }
}

async function loadMoreProjects() {
    const remaining = projectList.total - projectList.loaded;
    if (!factory || remaining <= 0) {
        return;
    }
    const limit = Math.min(PAGE_SIZE, remaining);
    const offset = remaining - limit;
    const addresses = [...(await factory.projectsOf(account, offset, limit))].reverse();
    projectList.loaded += limit;
    const rows = await Promise.all(addresses.map(renderProjectRow));
    document.getElementById('projectList').insertAdjacentHTML('beforeend', rows.join(''));
    document.getElementById('loadMoreProjects').style.display =
        projectList.loaded < projectList.total ? 'inline-block' : 'none';
}

async function renderProjectRow(address) {
    try {
        const p = await readProject(address);
        const counterparty = p.role === 'developer' ? p.client : p.developer;
        const counterpartyRole = p.role === 'developer' ? 'Client' : 'Developer';
        const name = await lookupName(counterparty);
        const actions = availableActions(p, chainNow()).filter((action) => action !== 'withdraw');
        const badges = [
            actions.length ? '<span class="badge action">Action available</span>' : '',
            p.owed > 0n ? '<span class="badge credit">Credit owed</span>' : ''
        ].join('');
        return `<li><button class="link" data-open-project="${escapeHtml(address)}">
            <span class="address">${escapeHtml(address)}</span></button> ${badges}<br>
            ${escapeHtml(counterpartyRole)}: <span class="address">${escapeHtml(counterparty)}</span>${nameSuffix(name)}<br>
            ${escapeHtml(p.asset ? p.asset.symbol : 'Unknown asset')} · ${escapeHtml(PROJECT_STATUS[p.status])}
        </li>`;
    } catch (error) {
        return `<li>${escapeHtml(address)}: could not load (${escapeHtml(describeError(error))})</li>`;
    }
}

// --- Create project ---------------------------------------------------------

function selectedAsset() {
    return findAsset(document.getElementById('assetSelect').value);
}

function clearSplit() {
    createDraft = null;
    document.getElementById('milestoneRows').innerHTML = '';
    document.getElementById('splitHint').style.display = 'none';
    document.getElementById('createProjectBtn').disabled = true;
}

function proposeSplit() {
    try {
        const asset = selectedAsset();
        if (!asset) {
            throw new Error('Choose an asset');
        }
        const total = MilestoneMath.parseUnits(document.getElementById('workTotalInput').value, asset.decimals);
        const count = Number(document.getElementById('milestoneCountInput').value);
        if (!Number.isInteger(count) || count < 1 || count > MAX_MILESTONES) {
            throw new Error(`The milestone count must be a whole number from 1 to ${MAX_MILESTONES}`);
        }
        const amounts = MilestoneMath.evenSplit(total, count);
        createDraft = { asset, total };
        document.getElementById('milestoneRows').innerHTML = amounts
            .map((amount, index) => `<div class="milestone-row">
                <label>Milestone ${index + 1} amount (${escapeHtml(asset.symbol)})
                    <input class="input split-amount" value="${escapeHtml(MilestoneMath.formatUnits(amount, asset.decimals))}"></label>
                <label>Review window (days)
                    <input class="input split-window" value="${DEFAULT_REVIEW_DAYS}"></label>
            </div>`)
            .join('');
        updateSplitHint();
    } catch (error) {
        clearSplit();
        showResult('createResult', escapeHtml(error.message), 'error');
    }
}

function readSplitRows() {
    const asset = createDraft.asset;
    const rows = [...document.querySelectorAll('#milestoneRows .milestone-row')];
    const errors = [];
    const amounts = [];
    const windows = [];
    rows.forEach((row, index) => {
        try {
            const amount = MilestoneMath.parseUnits(row.querySelector('.split-amount').value, asset.decimals);
            if (amount === 0n) {
                throw new Error('must be above zero');
            }
            amounts.push(amount);
        } catch (error) {
            errors.push(`Milestone ${index + 1} amount ${error.message}`);
        }
        try {
            windows.push(daysToSeconds(row.querySelector('.split-window').value));
        } catch (error) {
            errors.push(`Milestone ${index + 1}: ${error.message}`);
        }
    });
    return { amounts, windows, errors };
}

function updateSplitHint() {
    if (!createDraft) {
        return;
    }
    const { asset, total } = createDraft;
    const { amounts, errors } = readSplitRows();
    let message;
    if (errors.length) {
        message = errors.map(escapeHtml).join('<br>');
    } else {
        const { sum, difference } = MilestoneMath.sumDifference(amounts, total);
        message = `Milestones total ${escapeHtml(formatAmount(sum, asset))}. Work total ${escapeHtml(formatAmount(total, asset))}.`;
        if (difference !== 0n) {
            const sign = difference > 0n ? '+' : '-';
            const abs = difference > 0n ? difference : -difference;
            message += ` Difference ${sign}${escapeHtml(formatAmount(abs, asset))}. That is allowed; the milestones do not have to add up to the work total.`;
        }
    }
    showResult('splitHint', message, errors.length ? 'error' : 'info');
    document.getElementById('createProjectBtn').disabled = errors.length > 0 || !factory;
}

async function resolveAddressInput(text) {
    const value = text.trim();
    if (ethers.utils.isAddress(value)) {
        return ethers.utils.getAddress(value);
    }
    if (value.includes('.')) {
        let resolved = null;
        try {
            resolved = await provider.resolveName(value);
        } catch (error) {
            throw new Error(`Could not resolve ${value}: ${error.message}`);
        }
        if (resolved) {
            return resolved;
        }
        throw new Error(`${value} does not resolve to an address`);
    }
    throw new Error('Enter a valid address or ENS name');
}

async function createProject() {
    const button = document.getElementById('createProjectBtn');
    button.disabled = true;
    try {
        if (!factory || !createDraft) {
            throw new Error('Propose the milestone split first');
        }
        const asset = createDraft.asset;
        const client = await resolveAddressInput(document.getElementById('clientInput').value);
        if (sameAddress(client, account)) {
            throw new Error('The client must be a different account from yours');
        }
        const deposit = MilestoneMath.parseUnits(document.getElementById('depositInput').value, asset.decimals);
        if (deposit === 0n) {
            throw new Error('The deposit must be above zero');
        }
        const { amounts, windows, errors } = readSplitRows();
        if (errors.length) {
            throw new Error(errors.join('; '));
        }
        const lines = amounts.map((amount, i) => `  Milestone ${i + 1}: ${formatAmount(amount, asset)}, review window ${formatDuration(windows[i])}`);
        const ok = confirm(`Create this project?\n\nClient: ${client}\nAsset: ${asset.symbol}\nDeposit: ${formatAmount(deposit, asset)} (paid to you when the client locks it, never returned)\n${lines.join('\n')}`);
        if (!ok) {
            return;
        }
        showResult('createResult', 'Confirm the transaction in your wallet...', 'info');
        const tx = await factory.createProject(
            client,
            asset.address,
            deposit.toString(),
            amounts.map((amount) => amount.toString()),
            windows
        );
        const receipt = await tx.wait();
        const created = receipt.events.find((e) => e.event === 'ProjectCreated');
        const projectAddress = created.args.project;
        showResult('createResult', `Project created at <span class="address">${escapeHtml(projectAddress)}</span><br><strong>Transaction:</strong> <span class="hash">${escapeHtml(tx.hash)}</span>`, 'success');
        await refreshProjects();
        document.getElementById('projectAddressInput').value = projectAddress;
        await openProject(projectAddress);
    } catch (error) {
        showResult('createResult', 'Could not create the project: ' + escapeHtml(describeError(error)), 'error');
    } finally {
        button.disabled = !createDraft || !factory;
    }
}

// --- Project view -----------------------------------------------------------

async function readProject(address) {
    const contract = new ethers.Contract(address, PROJECT_ABI, signer);
    const [summary, milestones, owed] = await Promise.all([
        contract.getSummary(),
        contract.getMilestones(),
        contract.owed(account)
    ]);
    let role = 'viewer';
    if (sameAddress(account, summary.developer)) {
        role = 'developer';
    } else if (sameAddress(account, summary.client)) {
        role = 'client';
    }
    return {
        address,
        contract,
        role,
        asset: findAsset(summary.asset),
        developer: summary.developer,
        client: summary.client,
        deposit: toBig(summary.deposit),
        status: Number(summary.status),
        termsVersion: toBig(summary.termsVersion),
        confirmedVersion: toBig(summary.confirmedVersion),
        owed: toBig(owed),
        milestones: milestones.map((m, index) => ({
            index,
            amount: toBig(m.amount),
            reviewWindow: Number(m.reviewWindow),
            deliveredAt: Number(m.deliveredAt),
            status: Number(m.status)
        }))
    };
}

function reviewEnd(milestone) {
    return milestone.deliveredAt + milestone.reviewWindow;
}

function isOpen(p) {
    return p.status === 0 || p.status === 1;
}

function isConfirmed(p) {
    return p.confirmedVersion === p.termsVersion;
}

function nextFundable(p) {
    if (p.status !== 1) {
        return -1;
    }
    return p.milestones.findIndex((m, i) => i > 0 && m.status === 0 && p.milestones[i - 1].status === 3);
}

function availableActions(p, now) {
    const actions = [];
    if (p.role === 'developer' && isOpen(p) && !isConfirmed(p)) {
        actions.push('confirm');
    }
    if (p.role === 'client' && p.status === 0 && isConfirmed(p)) {
        actions.push('startLock');
    }
    if (p.role === 'client' && isConfirmed(p) && nextFundable(p) >= 0) {
        actions.push('fund');
    }
    p.milestones.forEach((m) => {
        if (p.role === 'developer' && p.status === 1 && m.status === 1) {
            actions.push('deliver');
        }
        if (m.status === 2) {
            if (now >= reviewEnd(m)) {
                actions.push('release');
            } else if (p.role === 'client') {
                actions.push('accept', 'reject');
            }
        }
    });
    if (p.owed > 0n) {
        actions.push('withdraw');
    }
    return actions;
}

async function loadClientEdits(p) {
    const [depositEdits, milestoneEdits] = await Promise.all([
        p.contract.queryFilter(p.contract.filters.DepositEdited(), 0),
        p.contract.queryFilter(p.contract.filters.MilestoneEdited(), 0)
    ]);
    return [...depositEdits, ...milestoneEdits]
        .filter((e) => toBig(e.args.termsVersion) > p.confirmedVersion && sameAddress(e.args.by, p.client))
        .sort((a, b) => (toBig(a.args.termsVersion) < toBig(b.args.termsVersion) ? -1 : 1))
        .map((e) => e.event === 'DepositEdited'
            ? `Deposit set to ${formatAmount(toBig(e.args.deposit), p.asset)}`
            : `Milestone ${Number(e.args.index) + 1} set to ${formatAmount(toBig(e.args.amount), p.asset)}, review window ${formatDuration(Number(e.args.reviewWindow))}`);
}

function clearProjectView() {
    currentProject = null;
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    const view = document.getElementById('projectView');
    if (view) {
        view.innerHTML = '';
    }
}

async function openProjectFromInput() {
    await openProject(document.getElementById('projectAddressInput').value.trim());
}

async function openProject(address, { keepMessage = false } = {}) {
    try {
        if (!factory) {
            showResult('projectResult', 'Connect a wallet on a supported network first.', 'error');
            return;
        }
        if (!ethers.utils.isAddress(address)) {
            showResult('projectResult', 'Enter a valid project address.', 'error');
            return;
        }
        if (!(await factory.isProject(address))) {
            clearProjectView();
            showResult('projectResult', 'Refused: that address was not created by this network\'s milestone factory.', 'error');
            return;
        }
        const p = await readProject(ethers.utils.getAddress(address));
        if (!p.asset) {
            throw new Error('The project asset is not in deployments.json for this network');
        }
        const [developerName, clientName, clientEdits] = await Promise.all([
            lookupName(p.developer),
            lookupName(p.client),
            isConfirmed(p) ? [] : loadClientEdits(p),
            syncChainClock()
        ]);
        Object.assign(p, { developerName, clientName, clientEdits });
        currentProject = p;
        if (!keepMessage) {
            document.getElementById('projectResult').style.display = 'none';
        }
        renderProject();
    } catch (error) {
        showResult('projectResult', 'Could not open the project: ' + escapeHtml(describeError(error)), 'error');
    }
}

function renderProject() {
    const p = currentProject;
    if (!p) {
        return;
    }
    const now = chainNow();
    const actions = availableActions(p, now);
    const fundIndex = nextFundable(p);
    const canEdit = p.role !== 'viewer' && isOpen(p);
    const roleLabel = { developer: 'Developer', client: 'Client', viewer: 'Viewer (read only)' }[p.role];
    const parts = [];

    parts.push(`<div class="status info">
        <strong>Project</strong> <span class="address">${escapeHtml(p.address)}</span><br>
        Your role: <strong>${escapeHtml(roleLabel)}</strong><br>
        Status: <strong>${escapeHtml(PROJECT_STATUS[p.status])}</strong><br>
        Asset: ${escapeHtml(p.asset.symbol)} (${escapeHtml(p.asset.decimals)} decimals). Amounts are fixed ${escapeHtml(p.asset.symbol)} quantities and are not repriced.<br>
        Developer: <span class="address">${escapeHtml(p.developer)}</span>${nameSuffix(p.developerName)}<br>
        Client: <span class="address">${escapeHtml(p.client)}</span>${nameSuffix(p.clientName)}<br>
        Deposit: ${escapeHtml(formatAmount(p.deposit, p.asset))}. It goes to the developer when the client locks it and is never returned.
    </div>`);

    if (p.status === 0 && canEdit) {
        parts.push(`<div class="edit-row">
            <label>Deposit (${escapeHtml(p.asset.symbol)})
                <input class="input" id="editDepositInput" value="${escapeHtml(MilestoneMath.formatUnits(p.deposit, p.asset.decimals))}"></label>
            <button class="button" data-action="editDeposit">Save deposit</button>
        </div>`);
    }

    if (!isConfirmed(p) && isOpen(p)) {
        const changes = p.clientEdits.length
            ? `<ul>${p.clientEdits.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
            : '<p>The client changed the terms.</p>';
        parts.push(`<div class="status error">
            <strong>The client changed these values since the developer last confirmed:</strong>${changes}
            ${p.role === 'developer'
                ? '<button class="button" data-action="confirmTerms">Confirm terms</button>'
                : '<em>Waiting for the developer to confirm your changes.</em>'}
        </div>`);
    }

    if (p.owed > 0n) {
        parts.push(`<div class="status success">You have a credit of ${escapeHtml(formatAmount(p.owed, p.asset))} that could not be sent automatically.
            <button class="button" data-action="withdraw">Withdraw</button></div>`);
    }

    if (p.status === 0) {
        if (p.role === 'client') {
            const m0 = p.milestones[0];
            parts.push(`<div class="section-inner">
                <label class="checkbox"><input type="checkbox" id="confirmDeveloper">
                    This is my developer: <span class="address">${escapeHtml(p.developer)}</span>${nameSuffix(p.developerName)}</label><br>
                <button class="button" id="startLockBtn" data-action="startLock" disabled>Lock deposit and milestone 1 (${escapeHtml(formatAmount(p.deposit + m0.amount, p.asset))})</button>
                <div class="note" id="startLockReason">${isConfirmed(p) ? 'Tick the developer confirmation to enable the start lock.' : 'Waiting for the developer to confirm your changes.'}</div>
            </div>`);
        } else {
            parts.push('<p class="note">Waiting for the client to lock the deposit and milestone 1.</p>');
        }
    }

    const rows = p.milestones.map((m) => {
        const cells = [];
        if (m.status === 0 && canEdit) {
            cells.push(`<input class="input small" data-edit-amount="${m.index}" value="${escapeHtml(MilestoneMath.formatUnits(m.amount, p.asset.decimals))}" aria-label="Milestone ${m.index + 1} amount">
                <input class="input small" data-edit-window="${m.index}" value="${escapeHtml(secondsToDays(m.reviewWindow))}" aria-label="Milestone ${m.index + 1} review window in days"> days
                <button class="button" data-action="editMilestone" data-index="${m.index}">Save</button>`);
        }
        if (m.index === fundIndex && p.role === 'client') {
            const disabled = isConfirmed(p) ? '' : ' disabled';
            const reason = isConfirmed(p) ? '' : '<div class="note">Waiting for the developer to confirm your changes.</div>';
            cells.push(`<button class="button" data-action="fundMilestone" data-index="${m.index}"${disabled}>Lock milestone ${m.index + 1}</button>${reason}`);
        }
        if (m.status === 1 && p.role === 'developer' && p.status === 1) {
            cells.push(`<button class="button" data-action="markDelivered" data-index="${m.index}">Mark delivered</button>
                <div class="note">Mark delivered only after you and the client agreed what the project covers and what this milestone means. The review window starts now.</div>`);
        }
        let reviewCell = '';
        if (m.status === 2) {
            const end = reviewEnd(m);
            reviewCell = escapeHtml(localTime(end));
            if (now < end) {
                if (p.role === 'client') {
                    cells.push(`<button class="button" data-action="accept" data-index="${m.index}">Accept and pay</button>
                        <button class="button danger" data-action="reject" data-index="${m.index}">Reject</button>
                        <div class="note">If you do nothing, the developer is paid at ${escapeHtml(localTime(end))}. <span data-countdown="${end}"></span></div>`);
                } else {
                    cells.push(`<div class="note">The client can accept or reject until ${escapeHtml(localTime(end))}. <span data-countdown="${end}"></span></div>`);
                }
            } else {
                cells.push(`<button class="button" data-action="release" data-index="${m.index}">Release payment to the developer</button>`);
            }
        }
        return `<tr>
            <td>${m.index + 1}</td>
            <td>${escapeHtml(formatAmount(m.amount, p.asset))}</td>
            <td>${escapeHtml(formatDuration(m.reviewWindow))}</td>
            <td>${escapeHtml(MILESTONE_STATUS[m.status])}</td>
            <td>${reviewCell}</td>
            <td>${cells.join('')}</td>
        </tr>`;
    });
    parts.push(`<div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Amount</th><th>Review window</th><th>Status</th><th>Review ends</th><th>Actions</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
    </table></div>`);

    if (p.status === 1 && fundIndex >= 0 && p.role === 'developer') {
        parts.push(`<p class="note">Milestone ${fundIndex + 1} is not locked. Do not start it until the client locks it.</p>`);
    }
    if (p.status === 2) {
        parts.push('<p class="note">The project stopped after a rejection. The deposit and paid milestones stay with the developer.</p>');
    }
    if (p.status === 3) {
        parts.push('<p class="note">Every milestone is paid. The project is complete.</p>');
    }
    if (!actions.length && p.role === 'viewer') {
        parts.push('<p class="note">You are not a party to this project.</p>');
    }

    document.getElementById('projectView').innerHTML = parts.join('');
    updateStartLockButton();
    startCountdown();
}

function updateStartLockButton() {
    const button = document.getElementById('startLockBtn');
    const checkbox = document.getElementById('confirmDeveloper');
    if (!button || !checkbox || !currentProject) {
        return;
    }
    const confirmed = isConfirmed(currentProject);
    button.disabled = !(checkbox.checked && confirmed);
    document.getElementById('startLockReason').textContent = !confirmed
        ? 'Waiting for the developer to confirm your changes.'
        : checkbox.checked ? '' : 'Tick the developer confirmation to enable the start lock.';
}

function startCountdown() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    if (!document.querySelector('#projectView [data-countdown]')) {
        return;
    }
    const tick = () => {
        const now = chainNow();
        let ended = false;
        document.querySelectorAll('#projectView [data-countdown]').forEach((element) => {
            const remaining = Number(element.dataset.countdown) - now;
            if (remaining <= 0) {
                ended = true;
            } else {
                element.textContent = `(${formatDuration(remaining)} left)`;
            }
        });
        if (ended) {
            renderProject();
        }
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
}

function setProjectButtonsDisabled(disabled) {
    document.querySelectorAll('#projectView button, #projectView input').forEach((element) => {
        element.disabled = disabled;
    });
}

async function runProjectTx(label, send) {
    setProjectButtonsDisabled(true);
    const address = currentProject.address;
    try {
        showResult('projectResult', `${escapeHtml(label)}: confirm in your wallet...`, 'info');
        const tx = await send();
        showResult('projectResult', `${escapeHtml(label)}: waiting for the transaction...`, 'info');
        await tx.wait();
        showResult('projectResult', `${escapeHtml(label)} succeeded.<br><strong>Transaction:</strong> <span class="hash">${escapeHtml(tx.hash)}</span>`, 'success');
    } catch (error) {
        showResult('projectResult', `${escapeHtml(label)} failed: ${escapeHtml(describeError(error))}`, 'error');
    }
    await openProject(address, { keepMessage: true });
    await refreshProjects();
}

async function ensureAllowance(p, needed) {
    if (sameAddress(p.asset.address, ZERO_ADDRESS)) {
        return;
    }
    const token = new ethers.Contract(p.asset.address, ERC20_ABI, signer);
    const balance = toBig(await token.balanceOf(account));
    if (balance < needed) {
        throw new Error(`Your ${p.asset.symbol} balance is ${formatAmount(balance, p.asset)}, but this needs ${formatAmount(needed, p.asset)}`);
    }
    const current = toBig(await token.allowance(account, p.address));
    if (current >= needed) {
        return;
    }
    if (p.asset.symbol === 'USDT' && current > 0n) {
        showResult('projectResult', 'USDT requires resetting an existing allowance to zero first. Confirm the reset in your wallet...', 'info');
        await (await token.approve(p.address, 0)).wait();
    }
    showResult('projectResult', `Approve the project to take exactly ${escapeHtml(formatAmount(needed, p.asset))}. Confirm in your wallet...`, 'info');
    await (await token.approve(p.address, needed.toString())).wait();
}

function fundingValue(p, amount) {
    return sameAddress(p.asset.address, ZERO_ADDRESS) ? { value: amount.toString() } : {};
}

async function onProjectViewClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !currentProject || button.disabled) {
        return;
    }
    const p = currentProject;
    const action = button.dataset.action;
    const index = Number(button.dataset.index);
    const m = p.milestones[index];

    try {
        if (action === 'editDeposit') {
            const value = MilestoneMath.parseUnits(document.getElementById('editDepositInput').value, p.asset.decimals);
            await runProjectTx('Save deposit', () => p.contract.editDeposit(value.toString()));
        } else if (action === 'editMilestone') {
            const amount = MilestoneMath.parseUnits(document.querySelector(`[data-edit-amount="${index}"]`).value, p.asset.decimals);
            const reviewWindow = daysToSeconds(document.querySelector(`[data-edit-window="${index}"]`).value);
            await runProjectTx(`Save milestone ${index + 1}`, () => p.contract.editMilestone(index, amount.toString(), reviewWindow));
        } else if (action === 'confirmTerms') {
            await runProjectTx('Confirm terms', () => p.contract.confirmTerms(p.termsVersion.toString()));
        } else if (action === 'startLock') {
            if (!document.getElementById('confirmDeveloper').checked) {
                throw new Error('Confirm that this is your developer first');
            }
            const m0 = p.milestones[0];
            const total = p.deposit + m0.amount;
            const ok = confirm(`Lock ${formatAmount(total, p.asset)} now?\n\n` +
                `- Deposit ${formatAmount(p.deposit, p.asset)} goes to the developer immediately and is never returned.\n` +
                `- Milestone 1: ${formatAmount(m0.amount, p.asset)} is locked in the project. After the developer marks it delivered, you have ${formatDuration(m0.reviewWindow)} to reject it. If you do not reject it in that time, the developer is paid.\n\n` +
                `Developer: ${p.developer}`);
            if (!ok) {
                return;
            }
            await runProjectTx('Start lock', async () => {
                await ensureAllowance(p, total);
                return p.contract.startLock(p.deposit.toString(), m0.amount.toString(), m0.reviewWindow, fundingValue(p, total));
            });
        } else if (action === 'fundMilestone') {
            const ok = confirm(`Lock milestone ${index + 1}: ${formatAmount(m.amount, p.asset)}?\n\n` +
                `- The deposit of ${formatAmount(p.deposit, p.asset)} was paid to the developer at the start and is never returned.\n` +
                `- After the developer marks this milestone delivered, you have ${formatDuration(m.reviewWindow)} to reject it. If you do not reject it in that time, the developer is paid.`);
            if (!ok) {
                return;
            }
            await runProjectTx(`Lock milestone ${index + 1}`, async () => {
                await ensureAllowance(p, m.amount);
                return p.contract.fundMilestone(index, m.amount.toString(), m.reviewWindow, fundingValue(p, m.amount));
            });
        } else if (action === 'markDelivered') {
            const ok = confirm(`Mark milestone ${index + 1} delivered? The client then has ${formatDuration(m.reviewWindow)} to accept or reject it.`);
            if (ok) {
                await runProjectTx(`Mark milestone ${index + 1} delivered`, () => p.contract.markDelivered(index));
            }
        } else if (action === 'accept') {
            if (confirm(`Accept milestone ${index + 1} and pay the developer ${formatAmount(m.amount, p.asset)} now?`)) {
                await runProjectTx(`Accept milestone ${index + 1}`, () => p.contract.accept(index));
            }
        } else if (action === 'reject') {
            const ok = confirm(`Reject milestone ${index + 1}?\n\n` +
                `- ${formatAmount(m.amount, p.asset)} returns to you.\n` +
                `- The project stops. No further milestones can be funded.\n` +
                `- The deposit and every milestone already paid stay with the developer.\n\nThis cannot be undone.`);
            if (ok) {
                await runProjectTx(`Reject milestone ${index + 1}`, () => p.contract.reject(index));
            }
        } else if (action === 'release') {
            await runProjectTx(`Release milestone ${index + 1}`, () => p.contract.release(index));
        } else if (action === 'withdraw') {
            await runProjectTx('Withdraw credit', () => p.contract.withdraw());
        }
    } catch (error) {
        showResult('projectResult', escapeHtml(describeError(error)), 'error');
    }
}
