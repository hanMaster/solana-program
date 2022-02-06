use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct VoteAccount {
    pub yes: u32,
    pub abstained: u32,
    pub no: u32,
}

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Rust vote program entrypoint");

    let accounts_iter = &mut accounts.iter();
    let account = next_account_info(accounts_iter)?;

    // The account must be owned by the program in order to modify its data
    if account.owner != program_id {
        msg!("Vote account does not have the correct program id");
        return Err(ProgramError::IncorrectProgramId);
    }

    let mut vote_account = VoteAccount::try_from_slice(&account.data.borrow())?;
    match instruction_data[0] {
        0 => vote_account.yes += 1,
        1 => vote_account.abstained += 1,
        2 => vote_account.no += 1,
        _ => msg!("Unknown vote type")
    }

    vote_account.serialize(&mut &mut account.data.borrow_mut()[..])?;

    msg!("Votes: yes:{}, abstained: {}, no:{}", vote_account.yes, vote_account.abstained, vote_account.no);

    Ok(())
}

// Sanity tests
#[cfg(test)]
mod test {
    use super::*;
    use solana_program::clock::Epoch;

    #[test]
    fn test_sanity() {
        let program_id = Pubkey::default();
        let key = Pubkey::default();
        let mut lamports = 0;
        let mut data = VoteAccount {
            yes: 0,
            abstained: 0,
            no: 0,
        }.try_to_vec().unwrap();
        let owner = Pubkey::default();
        let account = AccountInfo::new(
            &key,
            false,
            true,
            &mut lamports,
            &mut data,
            &owner,
            false,
            Epoch::default(),
        );
        let instruction_data_0: Vec<u8> = vec![0];
        let instruction_data_1: Vec<u8> = vec![1];
        let instruction_data_2: Vec<u8> = vec![2];

        let accounts = vec![account];

        assert_eq!(VoteAccount::try_from_slice(&accounts[0].data.borrow()).unwrap().yes, 0);

        process_instruction(&program_id, &accounts, &instruction_data_0).unwrap();
        assert_eq!(VoteAccount::try_from_slice(&accounts[0].data.borrow()).unwrap().yes, 1);

        process_instruction(&program_id, &accounts, &instruction_data_1).unwrap();
        assert_eq!(VoteAccount::try_from_slice(&accounts[0].data.borrow()).unwrap().abstained, 1);

        process_instruction(&program_id, &accounts, &instruction_data_2).unwrap();
        assert_eq!(VoteAccount::try_from_slice(&accounts[0].data.borrow()).unwrap().no, 1);
    }
}
