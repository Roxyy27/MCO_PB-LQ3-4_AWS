// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CampusVoting is Ownable {
    struct Candidate {
        uint256 id;
        string name;
        string position;
        uint256 voteCount;
        bool exists;
    }

    struct Registration {
        string name;
        string studentId;
        bool requested;
    }

    uint256 public candidateCount;
    uint256 public totalVotes;
    bool public electionOpen;
    bool public electionEnded;

    mapping(uint256 => Candidate) public candidates;
    mapping(address => bool) public authorizedVoters;
    mapping(address => bool) public hasVoted;

    mapping(address => Registration) private registrations;
    address[] private registrants;

    event CandidateAdded(uint256 indexed candidateId, string name);
    event VoterRegistered(address indexed voter, string name, string studentId);
    event VoterAuthorized(address indexed voter);
    event VoteCast(address indexed voter, uint256 indexed candidateId);
    event ElectionStatusChanged(bool isOpen);

    constructor() Ownable(msg.sender) {
        electionOpen = false;
        electionEnded = false;
    }

    // ---------- Admin ----------

    function addCandidate(
        string calldata _name,
        string calldata _position
    ) external onlyOwner {
        require(bytes(_name).length > 0, "Candidate name is required");
        require(!electionOpen && !electionEnded, "Cannot add candidates after election starts");

        candidateCount++;

        candidates[candidateCount] = Candidate({
            id: candidateCount,
            name: _name,
            position: _position,
            voteCount: 0,
            exists: true
        });

        emit CandidateAdded(candidateCount, _name);
    }

    function authorizeVoter(address _voter) external onlyOwner {
        require(_voter != address(0), "Invalid voter address");
        require(!electionOpen && !electionEnded, "Cannot authorize voters after election starts");

        authorizedVoters[_voter] = true;

        emit VoterAuthorized(_voter);
    }

    function startElection() external onlyOwner {
        require(candidateCount >= 2, "Add at least two candidates");
        require(!electionOpen, "Election is already open");
        require(!electionEnded, "Election has already ended");

        electionOpen = true;

        emit ElectionStatusChanged(true);
    }

    function endElection() external onlyOwner {
        require(electionOpen, "Election is not open");

        electionOpen = false;
        electionEnded = true;

        emit ElectionStatusChanged(false);
    }

    // ---------- Voter ----------

    function registerVoter(
        string calldata _name,
        string calldata _studentId
    ) external {
        require(!electionOpen && !electionEnded, "Registration is closed");
        require(!registrations[msg.sender].requested, "Already registered");
        require(bytes(_name).length > 0, "Name is required");
        require(bytes(_studentId).length > 0, "Student ID is required");

        registrations[msg.sender] = Registration({
            name: _name,
            studentId: _studentId,
            requested: true
        });
        registrants.push(msg.sender);

        emit VoterRegistered(msg.sender, _name, _studentId);
    }

    function vote(uint256 _candidateId) external {
        require(electionOpen, "Election is not open");
        require(authorizedVoters[msg.sender], "You are not authorized to vote");
        require(!hasVoted[msg.sender], "You have already voted");
        require(candidates[_candidateId].exists, "Invalid candidate");

        hasVoted[msg.sender] = true;
        candidates[_candidateId].voteCount++;
        totalVotes++;

        emit VoteCast(msg.sender, _candidateId);
    }

    // ---------- Views ----------

    function getCandidate(
        uint256 _candidateId
    ) external view returns (Candidate memory) {
        require(candidates[_candidateId].exists, "Invalid candidate");
        return candidates[_candidateId];
    }

    function getCandidateCount() external view returns (uint256) {
        return candidateCount;
    }

    function getTotalVotes() external view returns (uint256) {
        return totalVotes;
    }

    function getElectionStatus() external view returns (bool) {
        return electionOpen;
    }

    function getRegistration(
        address _voter
    ) external view returns (string memory name, string memory studentId, bool requested) {
        Registration storage r = registrations[_voter];
        return (r.name, r.studentId, r.requested);
    }

    function getRegistrantCount() external view returns (uint256) {
        return registrants.length;
    }

    function getRegistrant(
        uint256 _index
    )
        external
        view
        returns (
            address voter,
            string memory name,
            string memory studentId,
            bool authorized,
            bool voted
        )
    {
        require(_index < registrants.length, "Invalid index");
        address v = registrants[_index];
        Registration storage r = registrations[v];
        return (v, r.name, r.studentId, authorizedVoters[v], hasVoted[v]);
    }
}
