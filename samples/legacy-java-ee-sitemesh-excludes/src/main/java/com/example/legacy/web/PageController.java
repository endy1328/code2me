package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
public class PageController {
  @RequestMapping("/public/list.as")
  public String publicList() {
    return "public/list";
  }

  @RequestMapping("/admin/list.as")
  public String adminList() {
    return "admin/list";
  }
}
