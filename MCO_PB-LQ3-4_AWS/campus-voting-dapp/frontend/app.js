"use strict";

const CONTRACT_ADDRESS = "0x7AB6Bd4Bafe25b8c29D7a8613899f1ad8B19f107";
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_HEX = "0xaa36a7";

const ABI = [
  "function owner() view returns (address)",
  "function electionOpen() view returns (bool)",
  "function electionEnded() view returns (bool)",
  "function authorizedVoters(address) view returns (bool)",
  "function hasVoted(address) view returns (bool)",

  "function addCandidate(string _name, string _position)",
  "function authorizeVoter(address _voter)",
  "function startElection()",
  "function endElection()",
  "function registerVoter(string _name, string _studentId)",
  "function vote(uint256 _candidateId)",

  "function getCandidate(uint256 _candidateId) view returns (tuple(uint256 id, string name, string position, uint256 voteCount, bool exists))",
  "function getCandidateCount() view returns (uint256)",
  "function getTotalVotes() view returns (uint256)",
  "function getElectionStatus() view returns (bool)",
  "function getRegistration(address _voter) view returns (string name, string studentId, bool requested)",
  "function getRegistrantCount() view returns (uint256)",
  "function getRegistrant(uint256 _index) view returns (address voter, string name, string studentId, bool authorized, bool voted)"
];

let provider = null;
let signer = null;
let contract = null;
let currentAccount = null;
let currentRole = null;

const $ = (id) => document.getElementById(id);

function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);

  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "className") {
      element.className = value;
    } else if (key === "text") {
      element.textContent = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      element.setAttribute(key, value);
    }
  });

  children.forEach((child) => {
    if (child instanceof Node) {
      element.appendChild(child);
    } else if (child !== null && child !== undefined) {
      element.appendChild(document.createTextNode(String(child)));
    }
  });

  return element;
}

function showNotice(message, type = "info") {
  const notice = $("notice");

  if (!notice) return;

  notice.textContent = message;
  notice.className = "notice " + type;
}

function clearNotice() {
  const notice = $("notice");

  if (!notice) return;

  notice.textContent = "";
  notice.className = "";
}

function setButtonLoading(button, loading, text) {
  if (!button) return;

  button.disabled = loading;

  if (loading) {
    button.dataset.oldText = button.textContent;
    button.textContent = text || "Please wait...";
  } else {
    button.textContent = button.dataset.oldText || button.textContent;
  }
}

function formatAddress(address) {
  if (!address) return "Not Connected";

  return address.slice(0, 6) + "..." + address.slice(-4);
}

function getNumber(value) {
  return Number(value.toString());
}

function clearElement(element) {
  if (element) {
    element.replaceChildren();
  }
}

function showPage(page) {
  $("viewLogin").hidden = page !== "login";
  $("viewVoter").hidden = page !== "voter";
  $("viewAdmin").hidden = page !== "admin";

  $("logoutButton").hidden = page === "login";
}

function showLoginTab(tab) {
  const loginPane = $("loginPane");
  const signupPane = $("signupPane");

  loginPane.hidden = tab !== "login";
  signupPane.hidden = tab !== "signup";

  $("tabLogin").classList.toggle("active", tab === "login");
  $("tabSignup").classList.toggle("active", tab === "signup");
}

async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("Please install MetaMask first.");
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts"
  });

  if (!accounts.length) {
    throw new Error("No MetaMask account found.");
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  signer = provider.getSigner();
  currentAccount = accounts[0];

  const network = await provider.getNetwork();

  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    await switchNetwork();

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();

    currentAccount = await signer.getAddress();
  }

  contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    ABI,
    signer
  );

  updateWalletStatus();

  return currentAccount;
}

async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX }]
    });
  } catch (error) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: SEPOLIA_HEX,
          chainName: "Sepolia Test Network",
          nativeCurrency: {
            name: "Sepolia ETH",
            symbol: "ETH",
            decimals: 18
          },
          rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"]
        }]
      });
    } else {
      throw error;
    }
  }
}

function updateWalletStatus() {
  $("walletStatus").textContent =
    "Wallet: " + formatAddress(currentAccount);

  $("networkBadge").textContent = "Sepolia Network";
}

async function sendTx(button, action, successMessage) {
  try {
    setButtonLoading(button, true, "Processing...");

    const transaction = await action();

    showNotice("Waiting for transaction confirmation...", "info");

    await transaction.wait();

    showNotice(successMessage, "success");

    await refreshDashboard();

  } catch (error) {
    console.error(error);

    const message =
      error.reason ||
      error.data?.message ||
      error.message ||
      "Transaction failed.";

    showNotice(message, "error");

  } finally {
    setButtonLoading(button, false);
  }
}

async function getElectionPhase() {
  const ended = await contract.electionEnded();
  const open = await contract.electionOpen();

  if (ended) return "ended";
  if (open) return "open";

  return "waiting";
}

async function updatePhaseBanners() {
  const phase = await getElectionPhase();

  let message = "";

  if (phase === "waiting") {
    message = "Election has not started.";
  } else if (phase === "open") {
    message = "Election is currently open.";
  } else {
    message = "Election has ended.";
  }

  $("phaseBannerVoter").textContent = message;
  $("phaseBannerAdmin").textContent = message;
}

async function getCandidates() {
  const count = getNumber(await contract.getCandidateCount());
  const candidates = [];

  for (let id = 1; id <= count; id++) {
    const candidate = await contract.getCandidate(id);

    if (candidate.exists) {
      candidates.push({
        id: getNumber(candidate.id),
        name: candidate.name,
        position: candidate.position,
        votes: getNumber(candidate.voteCount)
      });
    }
  }

  return candidates;
}

async function displayCandidates() {
  const ballotList = $("ballotList");

  clearElement(ballotList);

  const candidates = await getCandidates();
  const phase = await getElectionPhase();

  const authorized = await contract.authorizedVoters(currentAccount);
  const voted = await contract.hasVoted(currentAccount);

  if (candidates.length === 0) {
    ballotList.textContent = "No candidates available.";
    return;
  }

  candidates.forEach((candidate) => {
    const card = h("div", { className: "candidate-card" });

    card.appendChild(h("h3", { text: candidate.name }));
    card.appendChild(h("p", { text: "Position: " + candidate.position }));

    if (phase === "open" && authorized && !voted) {
      const voteButton = h("button", {
        type: "button",
        text: "Vote"
      });

      voteButton.addEventListener("click", () => {
        voteForCandidate(candidate.id, voteButton);
      });

      card.appendChild(voteButton);
    }

    if (phase === "ended") {
      card.appendChild(
        h("p", { text: "Votes: " + candidate.votes })
      );
    }

    ballotList.appendChild(card);
  });
}

async function loadVoterDashboard() {
  await updatePhaseBanners();
  await displayCandidates();
  await displayVoterStatus();
  await displayVoterResults();
}

async function displayVoterStatus() {
  const status = $("voterStatus");
  const hint = $("ballotHint");

  const authorized = await contract.authorizedVoters(currentAccount);
  const voted = await contract.hasVoted(currentAccount);

  if (voted) {
    status.textContent = "You have already voted.";
    hint.textContent = "Thank you for participating.";
  } else if (!authorized) {
    status.textContent = "Your voter account is awaiting approval.";
    hint.textContent = "Please wait for the admin to approve your account.";
  } else {
    const phase = await getElectionPhase();

    if (phase === "open") {
      status.textContent = "You are approved to vote.";
      hint.textContent = "Choose one candidate to cast your vote.";
    } else if (phase === "ended") {
      status.textContent = "The election has ended.";
      hint.textContent = "Voting is no longer available.";
    } else {
      status.textContent = "You are approved to vote.";
      hint.textContent = "Please wait for the election to start.";
    }
  }
}

async function voteForCandidate(candidateId, button) {
  const confirmed = confirm(
    "Are you sure you want to vote for this candidate?"
  );

  if (!confirmed) return;

  await sendTx(
    button,
    () => contract.vote(candidateId),
    "Your vote has been submitted successfully."
  );
}

async function displayVoterResults() {
  const results = $("voterResults");

  clearElement(results);

  const phase = await getElectionPhase();

  if (phase !== "ended") {
    results.textContent = "Results will be available after the election.";
    return;
  }

  await displayResults(results);
}

async function displayResults(container) {
  const candidates = await getCandidates();

  if (candidates.length === 0) {
    container.textContent = "No results available.";
    return;
  }

  candidates.sort((a, b) => b.votes - a.votes);

  candidates.forEach((candidate, index) => {
    const resultCard = h("div", { className: "result-card" });

    resultCard.appendChild(
      h("h3", { text: (index + 1) + ". " + candidate.name })
    );

    resultCard.appendChild(
      h("p", { text: "Position: " + candidate.position })
    );

    resultCard.appendChild(
      h("p", { text: "Total Votes: " + candidate.votes })
    );

    container.appendChild(resultCard);
  });

  const totalVotes = await contract.getTotalVotes();

  container.appendChild(
    h("h3", { text: "Total Votes Cast: " + getNumber(totalVotes) })
  );
}

async function loadAdminDashboard() {
  await updatePhaseBanners();
  await loadAdminStatistics();
  await loadAdminControls();
  await loadRegistrantList();
  await loadAdminResults();
}

async function loadAdminStatistics() {
  const candidates = await contract.getCandidateCount();
  const registrants = await contract.getRegistrantCount();
  const votes = await contract.getTotalVotes();

  $("statCandidates").textContent = getNumber(candidates);
  $("statRegistered").textContent = getNumber(registrants);
  $("statVotes").textContent = getNumber(votes);
}

async function loadAdminControls() {
  const phase = await getElectionPhase();

  const startButton = $("startElectionButton");
  const endButton = $("endElectionButton");

  startButton.disabled = phase !== "waiting";
  endButton.disabled = phase !== "open";

  if (phase === "waiting") {
    $("controlHint").textContent = "You can start the election when ready.";
  } else if (phase === "open") {
    $("controlHint").textContent = "The election is currently running.";
  } else {
    $("controlHint").textContent = "The election has already ended.";
  }
}

async function startElection() {
  const candidates = await contract.getCandidateCount();

  if (getNumber(candidates) < 2) {
    showNotice("Add at least two candidates before starting.", "error");
    return;
  }

  const confirmed = confirm("Start the election now?");

  if (!confirmed) return;

  await sendTx(
    $("startElectionButton"),
    () => contract.startElection(),
    "Election started successfully."
  );
}

async function endElection() {
  const confirmed = confirm(
    "Are you sure you want to close the election?"
  );

  if (!confirmed) return;

  await sendTx(
    $("endElectionButton"),
    () => contract.endElection(),
    "Election closed successfully."
  );
}

async function addCandidate() {
  const name = $("candidateName").value.trim();
  const position = $("candidatePosition").value.trim();

  if (!name || !position) {
    showNotice("Please complete all candidate information.", "error");
    return;
  }

  const phase = await getElectionPhase();

  if (phase !== "waiting") {
    showNotice("Candidates can only be added before the election.", "error");
    return;
  }

  await sendTx(
    $("addCandidateButton"),
    () => contract.addCandidate(name, position),
    "Candidate added successfully."
  );

  $("candidateName").value = "";
  $("candidatePosition").value = "";
}
 
async function authorizeVoter() {
  const address = $("voterAddress").value.trim();

  if (!ethers.utils.isAddress(address)) {
    showNotice("Please enter a valid wallet address.", "error");
    return;
  }

  await sendTx(
    $("authorizeVoterButton"),
    () => contract.authorizeVoter(address),
    "Voter approved successfully."
  );

  $("voterAddress").value = "";
}

async function loadRegistrantList() {
  const list = $("registrantList");

  clearElement(list);

  const count = getNumber(await contract.getRegistrantCount());

  if (count === 0) {
    list.textContent = "No registered voters yet.";
    return;
  }

  for (let i = 0; i < count; i++) {
    const registrant = await contract.getRegistrant(i);

    const address = registrant.voter;
    const name = registrant.name;
    const studentId = registrant.studentId;
    const authorized = registrant.authorized;
    const voted = registrant.voted;

    const card = h("div", { className: "registrant-card" });

    card.appendChild(h("h3", { text: name }));
    card.appendChild(h("p", { text: "Student ID: " + studentId }));
    card.appendChild(h("p", { text: "Wallet: " + formatAddress(address) }));

    card.appendChild(
      h("p", {
        text: "Status: " + (authorized ? "Approved" : "Pending")
      })
    );

    card.appendChild(
      h("p", {
        text: "Voting: " + (voted ? "Voted" : "Not Yet Voted")
      })
    );

    if (!authorized) {
      const approveButton = h("button", {
        type: "button",
        text: "Approve"
      });

      approveButton.addEventListener("click", () => {
        approveRegistrant(address, approveButton);
      });

      card.appendChild(approveButton);
    }

    list.appendChild(card);
  }
}

async function approveRegistrant(address, button) {
  await sendTx(
    button,
    () => contract.authorizeVoter(address),
    "Voter approved successfully."
  );
}

async function loadAdminResults() {
  const results = $("adminResults");

  clearElement(results);

  const phase = await getElectionPhase();

  if (phase !== "ended") {
    results.textContent = "Results will appear after the election ends.";
    return;
  }

  await displayResults(results);
}

async function signUp() {
  const name = $("regName").value.trim();
  const studentId = $("regStudentId").value.trim();

  if (!name || !studentId) {
    showNotice("Please enter your full name and student ID.", "error");
    return;
  }

  try {
    await connectWallet();

    const phase = await getElectionPhase();

    if (phase !== "waiting") {
      showNotice("Sign up is closed because the election has started.", "error");
      return;
    }

    const registration = await contract.getRegistration(currentAccount);

    if (registration.requested) {
      showNotice("This wallet is already registered.", "error");
      return;
    }

    await sendTx(
      $("signUpButton"),
      () => contract.registerVoter(name, studentId),
      "Sign up successful. Please wait for admin approval."
    );

    $("regName").value = "";
    $("regStudentId").value = "";

  } catch (error) {
    console.error(error);

    showNotice(
      error.reason || error.message || "Sign up failed.",
      "error"
    );
  }
}

async function login(role) {
  try {
    clearNotice();

    await connectWallet();

    const owner = await contract.owner();

    if (role === "admin") {
      if (owner.toLowerCase() !== currentAccount.toLowerCase()) {
        showNotice("This wallet is not the admin account.", "error");
        return;
      }

      currentRole = "admin";

      showPage("admin");
      await loadAdminDashboard();

      showNotice("Admin login successful.", "success");
      return;
    }

    const registration = await contract.getRegistration(currentAccount);
    const authorized = await contract.authorizedVoters(currentAccount);

    if (!registration.requested && !authorized) {
      showNotice("Please sign up first to access the voter account.", "error");
      return;
    }

    currentRole = "voter";

    showPage("voter");
    await loadVoterDashboard();

    showNotice("Voter login successful.", "success");

  } catch (error) {
    console.error(error);

    showNotice(
      error.reason || error.message || "Login failed.",
      "error"
    );
  }
}

async function refreshDashboard() {
  if (!contract || !currentRole) return;

  if (currentRole === "admin") {
    await loadAdminDashboard();
  } else {
    await loadVoterDashboard();
  }
}

function logout() {
  provider = null;
  signer = null;
  contract = null;
  currentAccount = null;
  currentRole = null;

  $("walletStatus").textContent = "Wallet: Not Connected";
  $("networkBadge").textContent = "Not Connected";

  showPage("login");
  showLoginTab("login");
  clearNotice();
}

$("tabLogin").addEventListener("click", () => {
  showLoginTab("login");
});

$("tabSignup").addEventListener("click", () => {
  showLoginTab("signup");
});

$("loginVoterButton").addEventListener("click", () => {
  login("voter");
});

$("loginAdminButton").addEventListener("click", () => {
  login("admin");
});

$("signUpButton").addEventListener("click", signUp);

$("logoutButton").addEventListener("click", logout);

$("startElectionButton").addEventListener("click", startElection);

$("endElectionButton").addEventListener("click", endElection);

$("addCandidateButton").addEventListener("click", addCandidate);

$("authorizeVoterButton").addEventListener("click", authorizeVoter);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => {
    logout();
    showNotice("Wallet account changed. Please log in again.", "info");
  });

  window.ethereum.on("chainChanged", () => {
    logout();
    window.location.reload();
  });
}

showPage("login");
showLoginTab("login");