const CONTRACT_STORAGE_KEY = "brightbank.contractAddress";

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
	saveContract: document.getElementById("saveContractBtn")
};

let provider;
let signer;
let bank;
let connectedAddress;
let contractAddress = localStorage.getItem(CONTRACT_STORAGE_KEY) || "";

elements.contractAddress.value = contractAddress;

function showMessage(message, type = "info") {
	elements.message.textContent = message;
	elements.message.dataset.type = type;
}

function contractAddressIsConfigured() {
	return Boolean(contractAddress) && ethers.isAddress(contractAddress);
}

async function createBankContract() {
	if (!signer || !contractAddressIsConfigured()) return null;

	const code = await provider.getCode(contractAddress);
	if (code === "0x") {
		throw new Error("ไม่พบ Smart Contract ที่ address นี้บนเครือข่ายปัจจุบัน กรุณาตรวจสอบ address และ network ใน MetaMask");
	}

	return new ethers.Contract(contractAddress, BANK_ABI, signer);
}

function updateActionAvailability() {
	const ready = Boolean(bank && connectedAddress && contractAddressIsConfigured());
	elements.check.disabled = !ready;
	elements.deposit.disabled = !ready;
	elements.withdraw.disabled = !ready;
}

function shortAddress(address) {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function updateNetwork(chainId) {
	if (!elements.network) return;

	let name = "เครือข่ายไม่ทราบชื่อ";
	try {
		const network = await provider.getNetwork();
		name = network.name === "unknown" ? `Chain ${chainId}` : network.name;
	} catch {
		name = `Chain ${chainId}`;
	}

	elements.network.innerHTML = `<span class="status-dot"></span> ${name}`;
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
		const { chainId } = await provider.getNetwork();
		await updateNetwork(chainId);
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
	if (!bank) {
		showMessage("กรุณาเชื่อมต่อกระเป๋าและกำหนดที่อยู่ Smart Contract ก่อน", "warning");
		return;
	}

	try {
		const code = await provider.getCode(contractAddress);
		if (code === "0x") {
			throw new Error("ไม่พบ Smart Contract ที่ address นี้บนเครือข่ายปัจจุบัน กรุณาตรวจสอบ address และ network ใน MetaMask");
		}
		let amount;
		try {
			// The assignment contract spells this function as checkBlance().
			amount = await bank.checkBlance();
		} catch (misspelledFunctionError) {
			try {
				// Also support contracts that use the corrected spelling.
				amount = await bank.checkBalance();
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
	try {
		bank = await createBankContract();
		updateActionAvailability();
		showMessage("บันทึกที่อยู่ Smart Contract แล้ว", "success");
		if (bank) await checkBalance();
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
			const { chainId } = await provider.getNetwork();
			await updateNetwork(chainId);
			updateActionAvailability();
			if (bank) await checkBalance();
		} catch (error) {
			showMessage(getReadableError(error), "error");
		}
	});
}

updateActionAvailability();
