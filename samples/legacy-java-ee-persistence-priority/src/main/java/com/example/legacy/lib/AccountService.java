package com.example.legacy.lib;

public class AccountService {
  private final AccountDao accountDao = new AccountDao();

  public void loadAccounts() {
    accountDao.selectAccounts();
  }
}
