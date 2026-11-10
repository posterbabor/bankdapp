const CONTRACT_STORAGE_KEY = "brightbank.contractAddress";
const INFURA_STORAGE_KEY = "brightbank.infuraUrl";

// Infura API Key ของโปรเจกต์ ใช้เป็น RPC node สำหรับอ่านข้อมูลจาก blockchain
const INFURA_API_KEY = "d4637a44ac01421a8049fb62944fb5b5";
const INFURA_NETWORK_URLS = {
	mainnet: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
	sepolia: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
};

const BANK_ABI = [
	"function deposit() payable",
	"function withdraw(uint256 amount)",
	"function checkBlance() view returns (uint256)",
	"function checkBalance() view returns (uint256)",
	"event Deposit(address indexed owner, uint amount)",
	"event Withdraw(address indexed owner, uint amount)"
];

const elements = {
	connect: document.getElementById("connectBtn"),
	check: document.getElementById("checkBtn"),
	deposit: document.getElementById("depositBtn"),
	withdraw: document.getElementById("withdrawBtn"),
	depositAmount: document.getElementById("depositAmount"),
	withdrawAmount: document.getElementById("withdrawAmount"),
	balance: document.getElementById("balance"),
	wallet: document.getElementById("wallet"),
	message: document.getElementById("message"),
	network: document.querySelector(".network-pill"),
	contractAddress: document.getElementById("contractAddress"),
	saveContract: document.getElementById("saveContractBtn"),
	infuraUrl: document.getElementById("infuraUrl"),
	infuraNetwork: document.getElementById("infuraNetwork"),
	saveInfura: document.getElementById("saveInfuraBtn")
};

let provider;          // MetaMask provider (ใช้เซ็นธุรกรรม)
let signer;
let bank;              // Contract ที่ผูกกับ signer (เขียน/เซ็นธุรกรรม)
let bankRead;          // Contract ที่ผูกกับ Infura RPC (อ่านข้อมูล)
let infuraProvider;    // Infura JSON-RPC provider
let connectedAddress;
let contractAddress = localStorage.getItem(CONTRACT_STORAGE_KEY) || "";
let infuraUrl = localStorage.getItem(INFURA_STORAGE_KEY) || "";

elements.contractAddress.value = contractAddress;
elements.infuraUrl.value = infuraUrl;

// ใช้ Infura เป็น read provider ถ้าเชื่อมต่อไว้ ไม่งั้น fallback ไป MetaMask
function readProvider() {
	return infuraProvider || provider;
}

function showMessage(message, type = "info") {
	elements.message.textContent = message;
	elements.message.dataset.type = type;
}

function contractAddressIsConfigured() {
	return Boolean(contractAddress) && ethers.isAddress(contractAddress);
}

async function createBankContract() {
	if (!signer || !contractAddressIsConfigured()) return null;

	const rpc = readProvider();
	const code = await rpc.getCode(contractAddress);
	if (code === "0x") {
		throw new Error("ไม่พบ Smart Contract ที่ address นี้บนเครือข่ายปัจจุบัน กรุณาตรวจสอบ address และ network ใน MetaMask");
	}

	// ผูก contract กับ Infura (หรือ MetaMask ถ้าไม่มี Infura) สำหรับอ่านข้อมูล
	bankRead = new ethers.Contract(contractAddress, BANK_ABI, rpc);
	return new ethers.Contract(contractAddress, BANK_ABI, signer);
}

// สร้าง/รีเซ็ต contract สำหรับอ่านข้อมูลจาก Infura (ใช้เมื่อเปลี่ยน address โดยไม่ต้องรอ wallet)
function refreshBankRead() {
	if (infuraProvider && contractAddressIsConfigured()) {
		bankRead = new ethers.Contract(contractAddress, BANK_ABI, infuraProvider);
	} else if (!infuraProvider) {
		bankRead = null;
	}
}

// เชื่อมต่อ Infura RPC endpoint สำหรับอ่านข้อมูลจาก blockchain
async function setupInfura(silent = false) {
	const url = elements.infuraUrl.value.trim();
	infuraProvider = null;
	bankRead = null;

	if (url && !/^https:\/\/.+/i.test(url)) {
		if (!silent) showMessage("URL ของ Infura ไม่ถูกต้อง ต้องขึ้นต้นด้วย https:// เช่น https://sepolia.infura.io/v3/PROJECT_ID", "error");
		updateNetworkPill();
		return false;
	}

	if (url) {
		try {
			const rpc = new ethers.JsonRpcProvider(url);
			await rpc.getNetwork(); // ทดสอบว่า endpoint ใช้งานได้จริง
			infuraProvider = rpc;
			refreshBankRead();
			localStorage.setItem(INFURA_STORAGE_KEY, url);
			if (!silent) showMessage("เชื่อมต่อ Infura RPC สำเร็จ ระบบจะอ่านข้อมูลผ่าน Infura", "success");
		} catch (error) {
			infuraProvider = null;
			if (!silent) showMessage(`เชื่อมต่อ Infura ไม่สำเร็จ: ${error?.shortMessage || error?.message || "ตรวจสอบ URL และ Project ID"}`, "error");
		}
	} else if (!silent) {
		localStorage.removeItem(INFURA_STORAGE_KEY);
		showMessage("ล้างค่า Infura แล้ว ระบบจะกลับไปใช้ RPC ของ MetaMask", "info");
	}

	updateNetworkPill();
	return Boolean(infuraProvider);
}

function updateActionAvailability() {
	// CheckBalance ใช้ได้เมื่อมี contract สำหรับอ่าน (ผ่าน Infura หรือ MetaMask)
	elements.check.disabled = !(bankRead || (bank && connectedAddress));
	// ฝาก/ถอนต้องเซ็นธุรกรรม จึงต้องเชื่อมต่อ MetaMask
	elements.deposit.disabled = !bank;
	elements.withdraw.disabled = !bank;
}

function shortAddress(address) {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function updateNetworkPill() {
	if (!elements.network) return;

	let name = "ยังไม่ได้เชื่อมต่อ RPC";
	let prefix = "";

	if (infuraProvider) {
		prefix = "Infura · ";
		try {
			const network = await infuraProvider.getNetwork();
			name = network.name === "unknown" ? `Chain ${Number(network.chainId)}` : network.name;
		} catch {
			name = "เครือข่ายไม่ทราบชื่อ";
		}
	} else if (provider) {
		try {
			const network = await provider.getNetwork();
			name = network.name === "unknown" ? `Chain ${Number(network.chainId)}` : network.name;
		} catch {
			name = "เครือข่ายไม่ทราบชื่อ";
		}
	}

	elements.network.innerHTML = `<span class="status-dot"></span> ${prefix}${name}`;
}

async function connectWallet() {
	if (!window.ethereum) {
		showMessage("ไม่พบ MetaMask กรุณาติดตั้ง MetaMask แล้วลองอีกครั้ง", "error");
		return;
	}

	try {
		provider = new ethers.BrowserProvider(window.ethereum);
		await provider.send("eth_requestAccounts", []);
		signer = await provider.getSigner();
		connectedAddress = await signer.getAddress();
		bank = await createBankContract();

		elements.wallet.textContent = `เชื่อมต่อแล้ว · ${shortAddress(connectedAddress)}`;
		elements.connect.querySelector("span:first-child").textContent = "Wallet Connected";
		await updateNetworkPill();
		updateActionAvailability();

		if (bank) {
			showMessage("เชื่อมต่อกระเป๋าเรียบร้อยแล้ว", "success");
			await checkBalance();
		} else {
			showMessage("เชื่อมต่อกระเป๋าแล้ว กรุณากรอกและบันทึกที่อยู่ Smart Contract", "warning");
		}
	} catch (error) {
		bank = null;
		updateActionAvailability();
		showMessage(getReadableError(error), "error");
	}
}

async function checkBalance() {
	if (!bank && !bankRead) {
		showMessage("กรุณาเชื่อมต่อ Infura/MetaMask และกำหนดที่อยู่ Smart Contract ก่อน", "warning");
		return;
	}

	try {
		// อ่านยอดเงินผ่าน Infura RPC (ถ้าเชื่อมต่อไว้) โดยไม่เปลือง RPC ของ MetaMask
		const readContract = bankRead || bank;
		const rpc = readProvider();
		const code = await rpc.getCode(contractAddress);
		if (code === "0x") {
			throw new Error("ไม่พบ Smart Contract ที่ address นี้บนเครือข่ายปัจจุบัน กรุณาตรวจสอบ address และ network");
		}
		let amount;
		try {
			// The assignment contract spells this function as checkBlance().
			amount = await readContract.checkBlance();
		} catch (misspelledFunctionError) {
			try {
				// Also support contracts that use the corrected spelling.
				amount = await readContract.checkBalance();
			} catch {
				throw misspelledFunctionError;
			}
		}
		elements.balance.innerHTML = `${ethers.formatEther(amount)} <span>ETH</span>`;
		showMessage("อัปเดตยอดเงินเรียบร้อยแล้ว", "success");
	} catch (error) {
		showMessage(getReadableError(error, "check"), "error");
	}
}

function readAmount(input, actionName) {
	const value = input.value.trim();
	if (!value || !Number.isFinite(Number(value)) || Number(value) <= 0) {
		throw new Error(`กรุณาระบุจำนวน ETH ที่ต้องการ${actionName} ให้มากกว่า 0`);
	}
	return ethers.parseEther(value);
}

async function sendTransaction(button, action, pendingText, actionType) {
	if (!bank) {
		showMessage("กรุณาเชื่อมต่อกระเป๋าและกำหนดที่อยู่ Smart Contract ก่อน", "warning");
		return;
	}

	const originalText = button.innerHTML;
	button.disabled = true;
	button.textContent = pendingText;

	try {
		const { simulate, send } = await action();
		await simulate();
		const transaction = await send();
		showMessage(`ส่งรายการแล้ว กำลังรอยืนยัน: ${transaction.hash}`, "info");
		await transaction.wait();
		showMessage("ทำรายการสำเร็จ ยืนยันบนบล็อกเชนแล้ว", "success");
		await checkBalance();
	} catch (error) {
		showMessage(getReadableError(error, actionType), "error");
	} finally {
		button.innerHTML = originalText;
		updateActionAvailability();
	}
}

function getReadableError(error, actionType) {
	if (error?.code === 4001 || error?.code === "ACTION_REJECTED") {
		return "คุณยกเลิกรายการใน MetaMask";
	}
	if (error?.code === "INSUFFICIENT_FUNDS") {
		return "ETH ในกระเป๋าไม่เพียงพอสำหรับทำรายการและจ่ายค่า Gas";
	}
	if (error instanceof Error && error.message.startsWith("กรุณาระบุ")) {
		return error.message;
	}
	if (error instanceof Error && error.message.startsWith("ไม่พบ Smart Contract")) {
		return error.message;
	}
	if (error?.code === "CALL_EXCEPTION" || error?.code === 3 || error?.message?.includes("execution reverted")) {
		if (actionType === "withdraw") {
			return "Contract ปฏิเสธการถอน: ตรวจสอบว่ายอดถอนเป็น ETH ที่มีฝากไว้ในบัญชีนี้ และใช้ Contract/Network ที่ถูกต้อง";
		}
		if (actionType === "deposit") {
			return "Contract ปฏิเสธการฝาก: ตรวจสอบ address, network และฟังก์ชัน deposit() ของ Contract";
		}
		return "เรียก Contract ไม่สำเร็จ (revert): ตรวจสอบ address และ network ใน MetaMask ว่าตรงกับตอน deploy รวมถึง ABI/ชื่อฟังก์ชันของ Contract";
	}
	return error?.shortMessage || error?.reason || error?.message || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง";
}

async function saveContractAddress() {
	const enteredAddress = elements.contractAddress.value.trim();
	if (!ethers.isAddress(enteredAddress)) {
		showMessage("ที่อยู่ Contract ไม่ถูกต้อง กรุณาตรวจสอบรูปแบบ 0x...", "error");
		elements.contractAddress.focus();
		return;
	}

	contractAddress = ethers.getAddress(enteredAddress);
	localStorage.setItem(CONTRACT_STORAGE_KEY, contractAddress);
	refreshBankRead();
	try {
		bank = await createBankContract();
		updateActionAvailability();
		showMessage("บันทึกที่อยู่ Smart Contract แล้ว", "success");
		if (bank || bankRead) await checkBalance();
	} catch (error) {
		bank = null;
		updateActionAvailability();
		showMessage(getReadableError(error), "error");
	}
}

elements.connect.addEventListener("click", connectWallet);
elements.check.addEventListener("click", checkBalance);
elements.saveContract.addEventListener("click", saveContractAddress);
elements.contractAddress.addEventListener("keydown", (event) => {
	if (event.key === "Enter") saveContractAddress();
});
elements.deposit.addEventListener("click", () => {
	sendTransaction(elements.deposit, () => {
		const amount = readAmount(elements.depositAmount, "ฝาก");
		return {
			simulate: () => bank.deposit.staticCall({ value: amount }),
			send: () => bank.deposit({ value: amount })
		};
	}, "กำลังฝาก…", "deposit");
});
elements.withdraw.addEventListener("click", () => {
	sendTransaction(elements.withdraw, () => {
		const amount = readAmount(elements.withdrawAmount, "ถอน");
		return {
			simulate: () => bank.withdraw.staticCall(amount),
			send: () => bank.withdraw(amount)
		};
	}, "กำลังถอน…", "withdraw");
});

if (window.ethereum) {
	window.ethereum.on("accountsChanged", (accounts) => {
		if (!accounts.length) {
			signer = undefined;
			bank = undefined;
			connectedAddress = undefined;
			elements.wallet.textContent = "ยังไม่ได้เชื่อมต่อกระเป๋า";
			elements.connect.querySelector("span:first-child").textContent = "Connect MetaMask";
			elements.balance.innerHTML = '0 <span>ETH</span>';
			updateActionAvailability();
			showMessage("กระเป๋าถูกตัดการเชื่อมต่อ", "warning");
			return;
		}
		connectWallet();
	});

	window.ethereum.on("chainChanged", async () => {
		if (!provider) return;
		bank = null;
		updateActionAvailability();
		try {
			provider = new ethers.BrowserProvider(window.ethereum);
			signer = await provider.getSigner();
			bank = await createBankContract();
			refreshBankRead();
			await updateNetworkPill();
			updateActionAvailability();
			if (bank || bankRead) await checkBalance();
		} catch (error) {
			showMessage(getReadableError(error), "error");
		}
	});
}

elements.saveInfura.addEventListener("click", () => setupInfura(false));
elements.infuraUrl.addEventListener("keydown", (event) => {
	if (event.key === "Enter") setupInfura(false);
});
elements.infuraNetwork.addEventListener("change", () => {
	const network = elements.infuraNetwork.value;
	if (network !== "custom") {
		elements.infuraUrl.value = INFURA_NETWORK_URLS[network];
		setupInfura(true);
	} else {
		elements.infuraUrl.value = "";
		elements.infuraUrl.focus();
	}
});

updateActionAvailability();

// ตั้งค่าเริ่มต้น: ใช้ค่าที่บันทึกไว้ในเบราว์เซอร์ ถ้าไม่มีใช้ Sepolia ของ key โปรเจกต์
const savedNetwork = Object.entries(INFURA_NETWORK_URLS).find(([, url]) => url === infuraUrl);
elements.infuraNetwork.value = savedNetwork ? savedNetwork[0] : "sepolia";
if (!infuraUrl) elements.infuraUrl.value = INFURA_NETWORK_URLS.sepolia;
setupInfura(true);
