//! Stellar Fusion+ Timelock Contract
//! 
//! This contract implements a cross-chain timelock mechanism compatible with 
//! 1inch Fusion+ protocol. It supports hash time locked contracts (HTLCs) for
//! atomic cross-chain swaps between Ethereum and Stellar.
//!
//! Key features:
//! - Hash locks for secret-based unlocking
//! - Time locks for refund functionality
//! - Support for any Stellar token
//! - Integration with 1inch Fusion+ resolver system

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Bytes, BytesN, symbol_short
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Init,
    Escrow(u64), // Escrow ID
    EscrowCounter,
}

#[derive(Clone)]
#[contracttype]
pub struct HashLock {
    pub hash: BytesN<32>, // SHA-256 hash of the secret (32 bytes)
}

#[derive(Clone)]
#[contracttype]
pub struct TimeLock {
    pub expiration: u64, // Ledger timestamp
}

#[derive(Clone)]
#[contracttype]
pub struct CrossChainEscrow {
    pub id: u64,
    pub token: Address,
    pub amount: i128,
    pub depositor: Address,      // The resolver depositing funds
    pub beneficiary: Address,    // The maker who will receive funds
    pub hash_lock: HashLock,
    pub time_lock: TimeLock,
    pub is_claimed: bool,
    pub src_chain_id: u32,      // Source chain ID (e.g., Ethereum)
    pub order_hash: Bytes,      // Original order hash from source chain
}

#[contract]
pub struct StellarFusionContract;

#[contractimpl]
impl StellarFusionContract {
    /// Initialize the contract
    pub fn initialize(env: Env) {
        if env.storage().instance().has(&DataKey::Init) {
            panic!("Contract already initialized");
        }
        
        env.storage().instance().set(&DataKey::Init, &true);
        env.storage().instance().set(&DataKey::EscrowCounter, &0u64);
    }

    /// Create a new cross-chain escrow deposit
    /// This is called by the resolver to lock funds for the maker
    pub fn create_escrow(
        env: Env,
        depositor: Address,
        token: Address,
        amount: i128,
        beneficiary: Address,
        hash_lock: HashLock,
        time_lock_duration: u64, // Duration in seconds
        src_chain_id: u32,
        order_hash: Bytes,
    ) -> u64 {
        // Ensure depositor has authorized this call
        depositor.require_auth();
        
        // Validate inputs
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        
        if time_lock_duration == 0 {
            panic!("Time lock duration must be positive");
        }
        
        // BytesN<32> guarantees 32 bytes, so no length check needed
        
        // Get and increment escrow counter
        let mut counter: u64 = env.storage().instance().get(&DataKey::EscrowCounter).unwrap_or(0);
        counter += 1;
        env.storage().instance().set(&DataKey::EscrowCounter, &counter);
        
        // Calculate expiration time
        let current_time = env.ledger().timestamp();
        let expiration = current_time + time_lock_duration;
        
        // Transfer tokens from depositor to contract
        token::Client::new(&env, &token).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );
        
        // Create escrow record
        let escrow = CrossChainEscrow {
            id: counter,
            token,
            amount,
            depositor,
            beneficiary,
            hash_lock,
            time_lock: TimeLock { expiration },
            is_claimed: false,
            src_chain_id,
            order_hash,
        };
        
        env.storage().instance().set(&DataKey::Escrow(counter), &escrow);
        
        // Emit event (using contract data for now since Soroban events are limited)
        env.storage().temporary().set(
            &symbol_short!("event"),
            &("escrow_created", counter),
        );
        
        counter
    }

    /// Claim escrow with secret (hash lock unlock)
    /// This is called by the maker to claim funds using the secret
    pub fn claim_with_secret(
        env: Env,
        escrow_id: u64,
        secret: Bytes,
        claimant: Address,
    ) {
        claimant.require_auth();
        
        // Get escrow
        let mut escrow: CrossChainEscrow = env
            .storage()
            .instance()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic!("Escrow not found"));
        
        if escrow.is_claimed {
            panic!("Escrow already claimed");
        }
        
        // Verify claimant is the beneficiary
        if claimant != escrow.beneficiary {
            panic!("Only beneficiary can claim");
        }
        
        // Check if timelock has expired
        let current_time = env.ledger().timestamp();
        if current_time >= escrow.time_lock.expiration {
            panic!("Timelock has expired, use refund instead");
        }
        
        // Verify secret matches hash
        let secret_hash = env.crypto().sha256(&secret);
        if secret_hash != escrow.hash_lock.hash {
            panic!("Invalid secret");
        }
        
        // Mark as claimed
        escrow.is_claimed = true;
        env.storage().instance().set(&DataKey::Escrow(escrow_id), &escrow);
        
        // Transfer tokens to beneficiary
        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.beneficiary,
            &escrow.amount,
        );
        
        // Store the revealed secret for resolvers to read
        env.storage().temporary().set(
            &(symbol_short!("secret"), escrow_id),
            &secret,
        );
        
        // Emit event
        env.storage().temporary().set(
            &(symbol_short!("claimed"), escrow_id),
            &"escrow_claimed",
        );
    }

    /// Refund escrow after timelock expiration
    /// This is called by the depositor to get their funds back if secret wasn't revealed
    pub fn refund_escrow(
        env: Env,
        escrow_id: u64,
        refunder: Address,
    ) {
        refunder.require_auth();
        
        // Get escrow
        let mut escrow: CrossChainEscrow = env
            .storage()
            .instance()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic!("Escrow not found"));
        
        if escrow.is_claimed {
            panic!("Escrow already claimed");
        }
        
        // Verify refunder is the depositor
        if refunder != escrow.depositor {
            panic!("Only depositor can refund");
        }
        
        // Check if timelock has expired
        let current_time = env.ledger().timestamp();
        if current_time < escrow.time_lock.expiration {
            panic!("Timelock has not expired yet");
        }
        
        // Mark as claimed to prevent double refund
        escrow.is_claimed = true;
        env.storage().instance().set(&DataKey::Escrow(escrow_id), &escrow);
        
        // Refund tokens to depositor
        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.depositor,
            &escrow.amount,
        );
        
        // Emit event
        env.storage().temporary().set(
            &(symbol_short!("refunded"), escrow_id),
            &"escrow_refunded",
        );
    }

    /// Get escrow details
    pub fn get_escrow(env: Env, escrow_id: u64) -> CrossChainEscrow {
        env.storage()
            .instance()
            .get(&DataKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic!("Escrow not found"))
    }

    /// Get revealed secret for an escrow (if available)
    pub fn get_secret(env: Env, escrow_id: u64) -> Option<Bytes> {
        env.storage().temporary().get(&(symbol_short!("secret"), escrow_id))
    }

    /// Check if escrow exists and is active
    pub fn is_active_escrow(env: Env, escrow_id: u64) -> bool {
        if let Some(escrow) = env.storage().instance().get::<DataKey, CrossChainEscrow>(&DataKey::Escrow(escrow_id)) {
            !escrow.is_claimed && env.ledger().timestamp() < escrow.time_lock.expiration
        } else {
            false
        }
    }

    /// Get current escrow counter
    pub fn get_escrow_counter(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::EscrowCounter).unwrap_or(0)
    }
} 